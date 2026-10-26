// Run a user script in a sandboxed Web Worker with a hard timeout (the worker is terminated).
// `runUserScript` is the entry point for the chart (script plots as indicators).

import type { Bar, UserScript } from "@qt/core";
import type { ScriptOutput } from "./sandbox";

export const SCRIPT_TIMEOUT_MS = 2000;

/** The part of a Worker the runner uses (a fake in tests). */
export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

/** Post `msg`, resolve with the first reply, or a timeout/crash error; the worker is always terminated. */
export function runInWorker(create: () => WorkerLike, msg: unknown, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<ScriptOutput> {
  return new Promise((resolve) => {
    let w: WorkerLike;
    try {
      w = create();
    } catch (e) {
      resolve({ error: { message: `Could not start the script sandbox: ${(e as Error).message}` } });
      return;
    }
    let done = false;
    const finish = (r: ScriptOutput) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ error: { message: `Script stopped: it ran longer than ${timeoutMs / 1000} s` } }), timeoutMs);
    w.onmessage = (e) => finish(e.data as ScriptOutput);
    w.onerror = (e) => {
      e.preventDefault?.();
      finish({ error: { message: e.message || "Script sandbox crashed", line: e.lineno || undefined } });
    };
    w.postMessage(msg);
  });
}

const createScriptWorker = (): WorkerLike => new Worker(new URL("./scriptWorker.ts", import.meta.url), { type: "module" });

/** Run a script over bars in a fresh sandboxed worker (2 s limit). */
export function runUserScript(script: Pick<UserScript, "source">, bars: readonly Bar[], timeoutMs = SCRIPT_TIMEOUT_MS): Promise<ScriptOutput> {
  return runInWorker(createScriptWorker, { source: script.source, bars }, timeoutMs);
}
