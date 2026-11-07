import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { applyTick, isLiveSymbol, tickBucket, tickPrice } from "../src/chart/liveTick";

const bar = (time: number, close = 1.1): Bar => ({ time, open: close, high: close + 0.001, low: close - 0.001, close, volume: 5 });
const T = Date.UTC(2026, 9, 13, 10, 0) / 1000; // Tue 10:00 UTC

describe("tickBucket", () => {
  it("keeps ticks inside the last intraday bar", () => {
    expect(tickBucket(T, T + 899, "15m")).toBe(T);
    expect(tickBucket(T, T + 900, "15m")).toBe(T + 900);
    expect(tickBucket(T, T + 3 * 900 + 10, "15m")).toBe(T + 2700);
  });
  it("follows the last bar's grid even when it is not a UTC multiple", () => {
    const t0 = T - 3 * 3600 + 3600; // 4h bars starting at 21:00/01:00/... UTC
    expect(tickBucket(t0, t0 + 4 * 3600 + 5, "4h")).toBe(t0 + 4 * 3600);
  });
  it("buckets daily ticks by UTC date and never opens weekly/monthly bars", () => {
    const day = Date.UTC(2026, 9, 13) / 1000;
    expect(tickBucket(day, day + 86399, "1D")).toBe(day);
    expect(tickBucket(day, day + 86400 + 1, "1D")).toBe(day + 86400);
    expect(tickBucket(day, day + 30 * 86400, "1W")).toBe(day);
    expect(tickBucket(day, day + 60 * 86400, "1M")).toBe(day);
  });
});

describe("applyTick", () => {
  it("updates high/low/close of the current bar", () => {
    const r = applyTick(bar(T), 1.2, T + 30, "1m")!;
    expect(r.isNew).toBe(false);
    expect(r.bar).toMatchObject({ time: T, open: 1.1, high: 1.2, close: 1.2, volume: 5 });
    expect(r.bar.low).toBeCloseTo(1.099, 9);
    expect(applyTick(bar(T), 1.0, T + 30, "1m")!.bar.low).toBe(1.0);
  });
  it("opens a new bar when the tick crosses into the next bucket", () => {
    const r = applyTick(bar(T), 1.15, T + 61, "1m")!;
    expect(r).toEqual({ isNew: true, bar: { time: T + 60, open: 1.15, high: 1.15, low: 1.15, close: 1.15, volume: 0 } });
  });
  it("ignores stale or invalid ticks", () => {
    expect(applyTick(bar(T), 1.1, T - 1, "1m")).toBeNull();
    expect(applyTick(bar(T), NaN, T, "1m")).toBeNull();
    expect(applyTick(bar(T), 0, T, "1m")).toBeNull();
    expect(applyTick(undefined, 1, T, "1m")).toBeNull();
  });
});

describe("tick helpers", () => {
  it("prices from last, else bid", () => {
    expect(tickPrice({ symbol: "x", bid: 1.1, last: 0, time: 0 })).toBe(1.1);
    expect(tickPrice({ symbol: "x", bid: 1.1, last: 1.2, time: 0 })).toBe(1.2);
  });
  it("detects live symbols", () => {
    expect(isLiveSymbol("MT5:EURUSD")).toBe(true);
    expect(isLiveSymbol("EURUSD=X", "mt5")).toBe(true);
    expect(isLiveSymbol("DERIV:EURUSD")).toBe(true);
    expect(isLiveSymbol("deriv:R_100")).toBe(true);
    expect(isLiveSymbol("EURUSD=X", "deriv")).toBe(true);
    expect(isLiveSymbol("AAPL", "yahoo")).toBe(false);
  });
});
