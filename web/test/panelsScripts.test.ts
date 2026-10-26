import { describe, expect, it, vi } from "vitest";
import type { Bar, BacktestConfig } from "@qt/core";
import { rsi, sma } from "@qt/core/src/indicators";
import { evaluateScript, syntaxErrorLine } from "../src/panels/scripts/sandbox";
import { runInWorker, type WorkerLike } from "../src/panels/scripts/runner";
import { backtestSignals, signalsToStrategy } from "../src/panels/scripts/signals";
import { tokenize } from "../src/panels/scripts/highlight";
import examples from "../src/panels/scripts/examples.json";

const bars: Bar[] = Array.from({ length: 120 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 8) + i * 0.1;
  return { time: 1_700_000_000 + i * 86400, open: c - 0.5, high: c + 1, low: c - 1, close: c, volume: 1000 + i };
});

describe("script sandbox API", () => {
  it("exposes bars, columns and ta helpers matching core; collects plots and logs", () => {
    const out = evaluateScript(
      `plot("s", ta.sma(close, 5), { title: "SMA 5", color: "#123456" });
       plot("r", ta.rsi(close, 14), { pane: "separate", style: "histogram" });
       plot("x", ta.crossover(close, ta.sma(close, 20)), { style: "dots" });
       const m = ta.macd(close); const bb = ta.bollinger(close, 20, 2);
       log("n", bars.length, { last: close[close.length - 1] > 0 }, m.hist.length, bb.upper.length, ta.atr(14).length);`,
      bars,
    );
    expect(out.error).toBeUndefined();
    expect(out.outputs!.s).toEqual(sma(bars.map((b) => b.close), 5));
    expect(out.outputs!.r).toEqual(rsi(bars.map((b) => b.close), 14));
    expect(out.outputs!.x.every((v) => v === 0 || v === 1)).toBe(true);
    expect(out.outputs!.x.some((v) => v === 1)).toBe(true);
    expect(out.plots).toEqual([
      { key: "s", title: "SMA 5", style: "line", pane: "overlay", color: "#123456" },
      { key: "r", title: "r", style: "histogram", pane: "separate" },
      { key: "x", title: "x", style: "dots", pane: "overlay" },
    ]);
    expect(out.logs).toEqual(['n 120 {"last":true} 120 120 120']);
  });

  it("hides network and global names from the script", () => {
    const out = evaluateScript(`log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, typeof globalThis, typeof self, typeof window, typeof document);`, bars);
    expect(out.logs).toEqual(["undefined undefined undefined undefined undefined undefined undefined undefined"]);
  });

  it("cannot change the bars it receives", () => {
    const out = evaluateScript(`"use strict"; bars[0].close = 0;`, bars);
    expect(out.error?.message).toMatch(/read only|read-only|Cannot assign/i);
    expect(bars[0].close).not.toBe(0);
  });

  it("collects signals and validates them", () => {
    const ok = evaluateScript(`signal(10, "enter-long"); signal(5, "exit");`, bars);
    expect(ok.signals).toEqual([
      { index: 5, action: "exit" },
      { index: 10, action: "enter-long" },
    ]);
    expect(evaluateScript(`signal(500, "exit")`, bars).error?.message).toMatch(/bar index 0\.\.119/);
    expect(evaluateScript(`signal(1, "buy")`, bars).error?.message).toMatch(/enter-long, enter-short, exit/);
  });

  it("runs the shipped examples without errors", () => {
    for (const ex of examples) {
      const out = evaluateScript(ex.source, bars);
      expect(out.error, ex.name).toBeUndefined();
      expect(out.plots!.length, ex.name).toBeGreaterThan(0);
    }
    const ribbon = evaluateScript(examples[0].source, bars);
    expect(ribbon.plots!.map((p) => p.key)).toEqual(["sma10", "sma20", "sma30", "sma40", "sma50", "sma60"]);
    expect(evaluateScript(examples[2].source, bars).signals!.length).toBeGreaterThan(0);
  });
});

describe("script errors and timeout", () => {
  it("maps runtime errors to script lines", () => {
    const out = evaluateScript(`const a = 1;\nconst b = 2;\nnull.boom;\n`, bars);
    expect(out.error?.message).toMatch(/TypeError/);
    expect(out.error?.line).toBe(3);
    const thrown = evaluateScript(`\n\n\n  throw new Error("custom");`, bars);
    expect(thrown.error).toMatchObject({ message: "Error: custom", line: 4, column: 9 });
    const misuse = evaluateScript(`log(1);\nplot("", []);`, bars);
    expect(misuse.error?.line).toBe(2);
    expect(misuse.logs).toEqual(["1"]);
  });

  it("finds the line of a syntax error", () => {
    const src = "const a = 1;\nfor (let i = 0; i < 3; i++) {\n  log(i);\n}\nconst = 5;\nlog(a);";
    const out = evaluateScript(src, bars);
    expect(out.error?.message).toMatch(/^Syntax error/);
    expect(out.error?.line).toBe(5);
    expect(syntaxErrorLine("function f() {\n  return 1;\n}\n)")).toBe(4);
  });

  it("terminates a worker that does not answer within the limit", async () => {
    vi.useFakeTimers();
    const w: WorkerLike = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    const p = runInWorker(() => w, { source: "while(true){}", bars: [] }, 2000);
    expect(w.postMessage).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1999);
    expect(w.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(r.error?.message).toMatch(/longer than 2 s/);
    expect(w.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("resolves with the worker's answer and terminates it", async () => {
    const w: WorkerLike = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    w.postMessage = vi.fn(() => setTimeout(() => w.onmessage?.({ data: { logs: ["hi"] } } as MessageEvent), 5));
    const r = await runInWorker(() => w, {}, 2000);
    expect(r).toEqual({ logs: ["hi"] });
    expect(w.terminate).toHaveBeenCalledOnce();
  });
});

describe("signals -> StrategyDef", () => {
  const flat: Bar[] = [100, 101, 102, 103, 104, 105, 106, 107].map((p, i) => ({ time: 1_700_000_000 + i * 86400, open: p, high: p + 0.5, low: p - 0.5, close: p, volume: 1 }));
  const cfg: BacktestConfig = { initialCapital: 1000, commissionBps: 0, commissionFixed: 0, slippageBps: 0, sizing: { mode: "fixed-qty", qty: 2 }, allowShort: true, barsPerYear: 252 };

  it("replays signals by bar index", () => {
    const s = signalsToStrategy([{ index: 1, action: "enter-long" }, { index: 4, action: "exit" }, { index: 5, action: "enter-short" }]);
    expect(s.params).toEqual([]);
    expect(s.onBar({ index: 1, bars: flat, position: null, data: {} }, {})).toEqual({ action: "enter", side: "long" });
    expect(s.onBar({ index: 2, bars: flat, position: null, data: {} }, {})).toBeNull();
    expect(s.onBar({ index: 5, bars: flat, position: null, data: {} }, {})).toEqual({ action: "enter", side: "short" });
  });

  it("backtests on known data (fills at the next open)", () => {
    const r = backtestSignals(flat, [{ index: 1, action: "enter-long" }, { index: 4, action: "exit" }, { index: 5, action: "enter-short" }], cfg);
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ side: "long", entryIndex: 2, entryPrice: 102, exitIndex: 5, exitPrice: 105, qty: 2, pnl: 6, exitReason: "signal" });
    expect(r.trades[1]).toMatchObject({ side: "short", entryIndex: 6, entryPrice: 106, exitIndex: 7, exitPrice: 107, pnl: -2, exitReason: "end" });
    expect(r.metrics.trades).toBe(2);
  });
});

describe("editor highlighting", () => {
  it("tokenizes keywords, strings, numbers, comments, api names and calls", () => {
    const t = tokenize('const n = 20; // len\nplot("a", ta.sma(close, n));');
    const by = (type: string) => t.filter((x) => x.type === type).map((x) => x.text);
    expect(by("kw")).toEqual(["const"]);
    expect(by("num")).toEqual(["20"]);
    expect(by("com")).toEqual(["// len"]);
    expect(by("str")).toEqual(['"a"']);
    expect(by("api")).toEqual(["plot", "ta", "close"]);
    expect(by("fn")).toEqual(["sma"]);
    expect(t.map((x) => x.text).join("")).toBe('const n = 20; // len\nplot("a", ta.sma(close, n));');
  });
});
