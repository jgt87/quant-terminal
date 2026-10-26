import { describe, expect, it } from "vitest";
import { getIndicator, resampleBars, type Bar, type IndicatorInstance } from "@qt/core";
import { IndicatorSet } from "../src/chart/IndicatorSet";
import { REPLAY_OFF, countAtOrBefore, replayReducer, revealBars, type ReplayState } from "../src/chart/replay";
import { EMPTY_ACCOUNT, fillPrice, placeOrder, totalPnl, unrealized } from "../src/chart/replayPaper";
import { computeStudy } from "../src/chart/studies/compute";

const DAY = 86400;
const T0 = 1_704_067_200; // Monday 2024-01-01 00:00 UTC

function series(n: number, seed = 1): Bar[] {
  let x = 100;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  return Array.from({ length: n }, (_, i) => {
    const o = x;
    x = Math.max(1, x + rnd() * 4);
    return { time: T0 + i * DAY, open: o, high: Math.max(o, x) + 1, low: Math.min(o, x) - 1, close: x, volume: 1000 + i };
  });
}

const times = (bars: Bar[]) => bars.map((b) => b.time);
const on = (bars: Bar[], i: number): ReplayState =>
  replayReducer(replayReducer(REPLAY_OFF, { type: "arm" }), { type: "start", time: bars[i].time, times: times(bars) });

describe("replay cursor reducer", () => {
  const bars = series(50);
  const t = times(bars);

  it("arms, then starts at the bar at or before the picked time", () => {
    const armed = replayReducer(REPLAY_OFF, { type: "arm" });
    expect(armed.phase).toBe("select");
    expect(replayReducer(armed, { type: "start", time: t[10] + 100, times: t }).cursor).toBe(t[10]);
    expect(replayReducer(armed, { type: "start", time: t[0] - 999, times: t }).cursor).toBe(t[0]);
  });

  it("steps forward bar by bar and stops (and pauses) at the last bar", () => {
    let s = on(bars, 45);
    s = replayReducer(s, { type: "play" });
    s = replayReducer(s, { type: "step", times: t });
    expect(s.cursor).toBe(t[46]);
    s = replayReducer(s, { type: "step", n: 10, times: t });
    expect(s.cursor).toBe(t[49]);
    expect(s.playing).toBe(false);
    expect(replayReducer(s, { type: "toggle", times: t })).toBe(s); // nothing left to play
  });

  it("jumps to real time, clamps the speed and keeps it on exit", () => {
    let s = on(bars, 5);
    s = replayReducer(s, { type: "speed", value: 50 });
    expect(s.speed).toBe(10);
    s = replayReducer(s, { type: "realtime", times: t });
    expect(s.cursor).toBe(t[49]);
    const off = replayReducer(s, { type: "exit" });
    expect(off).toMatchObject({ phase: "off", cursor: null, playing: false, speed: 10 });
  });

  it("reveals only bars up to the cursor", () => {
    const s = on(bars, 20);
    expect(revealBars(bars, s)).toHaveLength(21);
    expect(revealBars(bars, REPLAY_OFF)).toBe(bars);
    expect(countAtOrBefore(t, t[20])).toBe(21);
  });

  it("never lets future bars into indicator inputs (also multi-timeframe and studies)", () => {
    const full = series(300, 7);
    const cut = 180;
    const s = on(full, cut);
    // Same history, completely different future.
    const other = full.map((b, i) => (i <= cut ? b : { ...b, open: b.open * 3, high: b.high * 3, low: b.low * 3, close: b.close * 3, volume: 1 }));
    const instances: IndicatorInstance[] = [
      { uid: "e", indicatorId: "ema", inputs: { length: 20 }, visible: true },
      { uid: "w", indicatorId: "ema", inputs: { length: 5 }, visible: true, timeframe: "1W" },
      { uid: "r", indicatorId: "rsi", inputs: { length: 14 }, visible: true },
    ];
    const run = (src: Bar[]) => {
      const revealed = revealBars(src, s) as Bar[];
      const weekly = resampleBars(src, DAY, 7 * DAY);
      const set = new IndicatorSet();
      set.setInstances(instances);
      set.computeAll(revealed, false, () => weekly, DAY);
      return { revealed, set };
    };
    const a = run(full);
    const b = run(other);
    expect(a.revealed).toHaveLength(cut + 1);
    expect(a.revealed.every((x) => x.time <= full[cut].time)).toBe(true);
    for (const uid of ["e", "w", "r"]) {
      const sa = a.set.get(uid)!.series;
      const sb = b.set.get(uid)!.series;
      expect(Object.keys(sa).length).toBeGreaterThan(0);
      for (const k of Object.keys(sa)) {
        expect(sa[k]).toHaveLength(cut + 1);
        expect(sb[k]).toEqual(sa[k]);
      }
    }
    // The revealed series equals a plain computation on the history prefix.
    expect(a.set.get("e")!.series.ema).toEqual(getIndicator("ema")!.compute(full.slice(0, cut + 1), { length: 20, source: "close" }).ema);
    // Weekly values only come from weeks that closed by each bar.
    const w = a.set.get("w")!.series.ema;
    expect(w.slice(0, 5).every((v) => v === null)).toBe(true);
    expect(w[cut]).not.toBeNull();
    // Studies see the same prefix.
    const za = computeStudy("zigzag", a.revealed, { deviation: 5, depth: 1 }, DAY);
    const zb = computeStudy("zigzag", b.revealed, { deviation: 5, depth: 1 }, DAY);
    expect(zb).toEqual(za);
    expect((za.pivots ?? []).every((p) => p.index <= cut)).toBe(true);
  });
});

describe("replay paper account", () => {
  const costs = { commissionBps: 5, slippageBps: 2 };
  const free = { commissionBps: 0, slippageBps: 0 };

  it("fills market orders at the close plus slippage and charges commission", () => {
    expect(fillPrice(100, "buy", 2)).toBeCloseTo(100.02, 10);
    expect(fillPrice(100, "sell", 2)).toBeCloseTo(99.98, 10);
    const a = placeOrder(EMPTY_ACCOUNT, { side: "buy", qty: 10 }, 100, 1, costs);
    expect(a.qty).toBe(10);
    expect(a.avgPrice).toBeCloseTo(100.02, 10);
    expect(a.fees).toBeCloseTo((100.02 * 10 * 5) / 10000, 10);
    expect(unrealized(a, 110)).toBeCloseTo(10 * (110 - 100.02), 8);
  });

  it("realizes P&L on closing and on flat, and reverses through zero", () => {
    let a = placeOrder(EMPTY_ACCOUNT, { side: "buy", qty: 10 }, 100, 1, free);
    a = placeOrder(a, { side: "sell", qty: 4 }, 110, 2, free);
    expect(a.qty).toBe(6);
    expect(a.realized).toBeCloseTo(40, 10);
    a = placeOrder(a, { side: "sell", qty: 10 }, 120, 3, free);
    expect(a.qty).toBe(-4);
    expect(a.avgPrice).toBe(120);
    expect(a.realized).toBeCloseTo(40 + 6 * 20, 10);
    a = placeOrder(a, { side: "flat" }, 115, 4, free);
    expect(a.qty).toBe(0);
    expect(a.realized).toBeCloseTo(160 + 20, 10);
    expect(totalPnl(a, 999)).toBeCloseTo(180, 10);
    expect(a.fills).toHaveLength(4);
    expect(placeOrder(a, { side: "flat" }, 1, 5, costs)).toBe(a);
  });
});
