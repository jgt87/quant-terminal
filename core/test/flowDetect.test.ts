import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { detectFlowEvents, eventsPerBar, IcebergTracker, type FootprintBar } from "../src/orderflow";

/** A footprint bar with `n` levels from `low` (tick 1), each with `buy` / `sell`, overrides per level index. */
function fp(time: number, low: number, n: number, over: Record<number, { buy?: number; sell?: number }> = {}): FootprintBar {
  const levels = Array.from({ length: n }, (_, i) => ({ price: low + i, buy: over[i]?.buy ?? 1, sell: over[i]?.sell ?? 1 }));
  const buy = levels.reduce((s, l) => s + l.buy, 0);
  const sell = levels.reduce((s, l) => s + l.sell, 0);
  return { time, levels, buy, sell, delta: buy - sell, poc: low, trades: n };
}
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });

describe("order flow detectors", () => {
  it("finds absorption at the low when heavy selling holds and the bar closes high", () => {
    const prints: FootprintBar[] = [];
    const bars: Bar[] = [];
    for (let i = 0; i < 6; i++) {
      prints.push(fp(i * 60, 100, 5));
      bars.push(bar(i * 60, 102, 105, 100, 102));
    }
    prints.push(fp(360, 100, 5, { 0: { sell: 20 }, 1: { sell: 10 } }));
    bars.push(bar(360, 102, 105, 100, 104));
    // Same heavy selling but the bar closes at the low: no absorption.
    prints.push(fp(420, 100, 5, { 0: { sell: 20 }, 1: { sell: 10 } }));
    bars.push(bar(420, 104, 105, 100, 100.5));
    const ev = detectFlowEvents(prints, bars, 1, { lookback: 20 });
    const abs = ev.filter((e) => e.kind === "absorption-bid");
    expect(abs).toEqual([{ kind: "absorption-bid", time: 360, price: 100, size: 30 }]);
    expect(ev.some((e) => e.kind === "absorption-ask")).toBe(false);
  });

  it("finds absorption at the high, mirrored", () => {
    const prints = [fp(0, 100, 5), fp(60, 100, 5), fp(120, 100, 5, { 3: { buy: 15 }, 4: { buy: 15 } })];
    const bars = [bar(0, 102, 105, 100, 102), bar(60, 102, 105, 100, 102), bar(120, 102, 105, 100, 101)];
    expect(detectFlowEvents(prints, bars, 1).filter((e) => e.kind === "absorption-ask")).toEqual([{ kind: "absorption-ask", time: 120, price: 105, size: 30 }]);
  });

  it("finds stop runs that sweep the prior range and close back inside", () => {
    const prints: FootprintBar[] = [];
    const bars: Bar[] = [];
    for (let i = 0; i < 10; i++) {
      prints.push(fp(i * 60, 100, 5));
      bars.push(bar(i * 60, 102, 104, 100, 102));
    }
    // Sweeps 104 up to 107 with buying above it, closes at 103.
    prints.push(fp(600, 100, 8, { 5: { buy: 4 }, 6: { buy: 4 }, 7: { buy: 4 } }));
    bars.push(bar(600, 102, 107, 100, 103));
    // Breaks out and holds above: not a stop run.
    prints.push(fp(660, 100, 9, { 7: { buy: 10 }, 8: { buy: 10 } }));
    bars.push(bar(660, 103, 108, 100, 107.5));
    const runs = detectFlowEvents(prints, bars, 1).filter((e) => e.kind.startsWith("stop-run"));
    expect(runs).toEqual([{ kind: "stop-run-up", time: 600, price: 107, size: 13 }]); // bins 104..107 (the 104 bin reaches above 104)
  });

  it("tracks icebergs: a level that trades several times its shown size while still showing", () => {
    const t = new IcebergTracker(3, 0);
    t.level("ask", 100, 2);
    expect(t.trade({ id: 1, time: 1000, price: 100, qty: 2, buy: true })).toBeNull();
    t.level("ask", 100, 2); // refilled
    expect(t.trade({ id: 2, time: 2000, price: 100, qty: 2, buy: true })).toBeNull();
    t.level("ask", 100, 1.5);
    expect(t.trade({ id: 3, time: 3000, price: 100, qty: 2.5, buy: true })).toEqual({ kind: "iceberg-ask", time: 3, price: 100, size: 6.5 });
    // Counting starts again; a sell trade does not touch the ask.
    expect(t.trade({ id: 4, time: 4000, price: 100, qty: 9, buy: false })).toBeNull();
    // A level that is consumed (removed) is forgotten.
    t.level("bid", 99, 1);
    t.level("bid", 99, 0);
    expect(t.trade({ id: 5, time: 5000, price: 99, qty: 10, buy: false })).toBeNull();
    t.reset();
    expect(t.trade({ id: 6, time: 6000, price: 100, qty: 10, buy: true })).toBeNull();
  });

  it("counts events per bar", () => {
    const ev = [
      { kind: "iceberg-ask" as const, time: 65, price: 1, size: 1 },
      { kind: "iceberg-ask" as const, time: 119, price: 1, size: 1 },
      { kind: "iceberg-bid" as const, time: 70, price: 1, size: 1 },
      { kind: "iceberg-ask" as const, time: 10, price: 1, size: 1 },
    ];
    expect([...eventsPerBar(ev, "iceberg-ask", [60, 120])]).toEqual([[60, 2]]);
  });
});
