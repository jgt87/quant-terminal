// Evaluation core of user scripts (runs inside the Web Worker, and in Node for tests).
// The script body is compiled with `new Function` and sees only: bars, open/high/low/close/
// volume arrays, `ta`, `plot`, `log` and `signal`. Network and DOM names are shadowed with
// undefined (the worker also deletes them from its global scope before evaluating).

import type { Bar, ScriptRunResult, Series } from "@qt/core";
import { tokenize } from "./highlight";
import { makeTa } from "./ta";

export type SignalAction = "enter-long" | "enter-short" | "exit";
export interface ScriptSignal {
  index: number;
  action: SignalAction;
}

export interface ScriptOutput extends ScriptRunResult {
  signals?: ScriptSignal[];
}

type Plot = NonNullable<ScriptRunResult["plots"]>[number];

const API = ["bars", "open", "high", "low", "close", "volume", "ta", "plot", "log", "signal"] as const;
/** Names shadowed with undefined inside the script. */
export const BLOCKED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "self", "globalThis", "window", "document", "postMessage", "indexedDB", "caches", "navigator", "location"] as const;
const PARAMS = [...API, ...BLOCKED];

export const MAX_LOGS = 500;
const MAX_PLOTS = 64;
const STYLES = ["line", "histogram", "dots"] as const;
const ACTIONS: SignalAction[] = ["enter-long", "enter-short", "exit"];

class ScriptError extends Error {}

/** Line offset of `new Function` bodies in this engine (the header lines before the body). */
let bodyOffset: number | null = null;
function lineOffset(): number {
  if (bodyOffset !== null) return bodyOffset;
  try {
    new Function(...PARAMS, "throw new Error('probe')")();
  } catch (e) {
    const pos = stackPosition(e);
    bodyOffset = pos ? pos.line - 1 : 2;
  }
  return bodyOffset ?? 2;
}

/** First "<anonymous>:line:col" (V8) / "Function:line:col" (others) position in a stack. */
function stackPosition(e: unknown): { line: number; column: number } | null {
  const stack = e instanceof Error ? (e.stack ?? "") : "";
  const m = /(?:<anonymous>|anonymous|Function):(\d+):(\d+)/.exec(stack);
  return m ? { line: Number(m[1]), column: Number(m[2]) } : null;
}

/** Closing text that completes `src`'s open brackets (and an open template literal), or null when unbalanced. */
function closers(src: string): string | null {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  let tail = "";
  for (const t of tokenize(src)) {
    if (t.type === "com") {
      if (t.text.startsWith("/*") && !t.text.endsWith("*/")) tail = "*/";
      continue;
    }
    if (t.type === "str") {
      if (t.text.startsWith("`") && (t.text.length === 1 || !t.text.endsWith("`"))) tail = "`";
      continue;
    }
    if (t.type !== "plain") continue;
    for (const ch of t.text) {
      if (ch in pairs) stack.push(pairs[ch]);
      else if (ch === ")" || ch === "]" || ch === "}") {
        if (stack.pop() !== ch) return null;
      }
    }
  }
  return tail + NL + stack.reverse().join("");
}

const NL = String.fromCharCode(10);

const compiles = (src: string) => {
  try {
    new Function(src);
    return true;
  } catch {
    return false;
  }
};

/**
 * Best-effort line of a syntax error: the first line whose source prefix fails to compile even
 * after its open brackets are closed (an unfinished block is not an error yet).
 */
export function syntaxErrorLine(source: string): number | undefined {
  const lines = source.split(NL);
  for (let k = 1; k <= lines.length; k++) {
    const prefix = lines.slice(0, k).join(NL);
    if (compiles(prefix)) continue;
    const close = closers(prefix);
    if (close === null) return k;
    // Unfinished statements (e.g. "const x =") are completed by the following lines; only
    // treat the prefix as broken when closing its brackets and ending the statement do not help.
    if (compiles(prefix + close) || compiles(prefix + " 0;" + close) || compiles(prefix + " {}" + close)) continue;
    return k;
  }
  return undefined;
}

const fmt = (v: unknown): string => {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x)) ?? String(v);
  } catch {
    return String(v);
  }
};

function toSeries(values: unknown, n: number, key: string): Series {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) throw new ScriptError(`plot("${key}"): series must be an array`);
  const arr = values as ArrayLike<unknown>;
  const out: Series = new Array(n).fill(null);
  // Align to the last bar when shorter (e.g. a series computed on a slice).
  const shift = n - Math.min(arr.length, n);
  for (let i = 0; i < Math.min(arr.length, n); i++) {
    const v = arr[i + Math.max(0, arr.length - n)];
    out[i + shift] = typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
  }
  return out;
}

/** Compile and run a script over `bars`. Never throws: errors come back in `error`. */
export function evaluateScript(source: string, bars: readonly Bar[]): ScriptOutput {
  const n = bars.length;
  const outputs: Record<string, Series> = {};
  const plots: Plot[] = [];
  const logs: string[] = [];
  const signals: ScriptSignal[] = [];

  const plot = (key: unknown, series: unknown, opts: Record<string, unknown> = {}) => {
    if (typeof key !== "string" || !key) throw new ScriptError("plot(key, series, options): key must be a non-empty string");
    if (!(key in outputs) && plots.length >= MAX_PLOTS) throw new ScriptError(`At most ${MAX_PLOTS} plots`);
    outputs[key] = toSeries(series, n, key);
    const style = STYLES.includes(opts.style as Plot["style"]) ? (opts.style as Plot["style"]) : "line";
    const p: Plot = { key, title: typeof opts.title === "string" ? opts.title : key, style, pane: opts.pane === "separate" ? "separate" : "overlay" };
    if (typeof opts.color === "string") p.color = opts.color;
    const i = plots.findIndex((x) => x.key === key);
    if (i >= 0) plots[i] = p;
    else plots.push(p);
  };
  const log = (...args: unknown[]) => {
    if (logs.length < MAX_LOGS) logs.push(args.map(fmt).join(" "));
    else if (logs.length === MAX_LOGS) logs.push(`… more log lines dropped (max ${MAX_LOGS})`);
  };
  const signal = (index: unknown, action: unknown) => {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= n) throw new ScriptError(`signal(index, action): index must be a bar index 0..${n - 1}`);
    if (!ACTIONS.includes(action as SignalAction)) throw new ScriptError(`signal(index, action): action must be one of ${ACTIONS.join(", ")}`);
    signals.push({ index, action: action as SignalAction });
  };

  const frozen = Object.freeze(bars.map((b) => Object.freeze({ ...b })));
  const col = (k: keyof Bar) => Object.freeze(bars.map((b) => b[k]));
  const args = [frozen, col("open"), col("high"), col("low"), col("close"), col("volume"), makeTa(bars), plot, log, signal, ...BLOCKED.map(() => undefined)];

  let fn: (...a: unknown[]) => unknown;
  try {
    fn = new Function(...PARAMS, source) as typeof fn;
  } catch (e) {
    return { logs, error: { message: `Syntax error: ${(e as Error).message}`, line: syntaxErrorLine(source) } };
  }
  try {
    fn(...args);
  } catch (e) {
    // For API misuse (plot/signal) the first script frame in the stack is the caller's line.
    const pos = stackPosition(e);
    const error: ScriptOutput["error"] = { message: e instanceof Error ? `${e instanceof ScriptError ? "" : e.name + ": "}${e.message}` : String(e) };
    if (pos) {
      error.line = pos.line - lineOffset();
      error.column = pos.column;
    }
    return { outputs, plots, logs, signals, error };
  }
  return { outputs, plots, logs, signals: signals.sort((a, b) => a.index - b.index) };
}
