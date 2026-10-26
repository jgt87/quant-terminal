import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { sessionVolumeProfiles, tpoLetter, tpoProfile, valueAreaRange, volumeProfile } from "../src/analysis/profile";

const b = (time: number, open: number, high: number, low: number, close: number, volume: number): Bar => ({
  time,
  open,
  high,
  low,
  close,
  volume,
});

// Rows of size 1 over 100..105. Volume per row:
//   row 0 [100,101]: b0 10 (up)
//   row 1 [101,102]: b1 20 (down, half of 40 over 101..103)
//   row 2 [102,103]: b1 20 (down) + b2 30 (up) + b5 5 (up, flat bar at 102.5) = 55
//   row 3 [103,104]: b3 20 (up)
//   row 4 [104,105]: b4 5 (down)
const BARS: Bar[] = [
  b(0, 100.2, 101, 100, 100.8, 10),
  b(1, 103, 103, 101, 101, 40),
  b(2, 102.1, 103, 102, 102.9, 30),
  b(3, 103.1, 104, 103, 103.9, 20),
  b(4, 105, 105, 104, 104, 5),
  b(5, 102.5, 102.5, 102.5, 102.5, 5),
];

describe("volumeProfile", () => {
  it("spreads volume over covered rows, splits up/down, finds POC and value area", () => {
    const vp = volumeProfile(BARS, 0, 5, { rowSize: 1 });
    expect(vp.rows.map((r) => [r.priceLow, r.priceHigh, r.volume])).toEqual([
      [100, 101, 10],
      [101, 102, 20],
      [102, 103, 55],
      [103, 104, 20],
      [104, 105, 5],
    ]);
    expect([vp.rows[2].upVolume, vp.rows[2].downVolume]).toEqual([35, 20]);
    expect(vp.poc).toBe(102.5);
    // Total 110, target 77. Start 55; above pair (rows 3,4) = 25 < below pair (rows 1,0) = 30
    // → add below: 85 >= 77. VA = rows 0..2 → VAL 100, VAH 103.
    expect([vp.val, vp.vah]).toEqual([100, 103]);
  });
  it("a row count gives the same rows here", () => {
    const vp = volumeProfile(BARS, 0, 5, 5);
    expect(vp.rows.map((r) => r.volume)).toEqual([10, 20, 55, 20, 5]);
    expect([vp.startIndex, vp.endIndex]).toEqual([0, 5]);
  });
  it("respects the index range", () => {
    const vp = volumeProfile(BARS, 3, 4, { rowSize: 1 });
    expect(vp.rows.map((r) => r.volume)).toEqual([20, 5]);
    expect(vp.poc).toBe(103.5);
  });
});

describe("valueAreaRange", () => {
  it("ties go up and a missing side loses", () => {
    // [5, 5, 10, 5, 5]: total 30, target 21. Start 10; pairs tie (10 vs 10) → up → 20; then only below → 30.
    expect(valueAreaRange([5, 5, 10, 5, 5], 2, 70)).toEqual([0, 4]);
    // [1, 1, 10, 9, 1]: total 22, target 15.4. Up pair 10 > down pair 2 → rows 2..4 = 20.
    expect(valueAreaRange([1, 1, 10, 9, 1], 2, 70)).toEqual([2, 4]);
  });
});

describe("sessionVolumeProfiles", () => {
  it("one profile per session day", () => {
    const D = 86400;
    const bars = [b(0, 1, 2, 1, 2, 1), b(3600, 2, 3, 2, 3, 1), b(D, 3, 4, 3, 4, 1), b(D + 60, 4, 5, 4, 5, 1)];
    expect(sessionVolumeProfiles(bars, 0, 4).map((p) => [p.startIndex, p.endIndex])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // Sessions starting 00:30 UTC: the 00:00 bar belongs to the previous session; 01:00, day 1 00:00 and 00:01 share one.
    expect(sessionVolumeProfiles(bars, 1800, 4).map((p) => [p.startIndex, p.endIndex])).toEqual([
      [0, 0],
      [1, 3],
    ]);
  });
});

describe("tpoProfile", () => {
  it("letters per 30-minute period, POC, value area, initial balance", () => {
    const t0 = 86400;
    const m = 60;
    const bars = [
      b(t0, 100, 102, 100, 101, 1), // period A
      b(t0 + 15 * m, 101, 103, 101, 102, 1), // period A → A spans 100..103
      b(t0 + 30 * m, 102, 104, 102, 103, 1), // period B
      b(t0 + 45 * m, 103, 104, 103, 104, 1), // period B → B spans 102..104
      b(t0 + 60 * m, 102, 102, 101, 101, 1), // period C spans 101..102
    ];
    const tpo = tpoProfile(bars, 30, 1);
    expect(tpo.rows).toEqual([
      { price: 100, letters: "A" },
      { price: 101, letters: "AC" },
      { price: 102, letters: "ABC" },
      { price: 103, letters: "AB" },
      { price: 104, letters: "B" },
    ]);
    expect(tpo.poc).toBe(102);
    // 9 TPOs, target 6.3: 3 → +3 (tie, up) = 6 → +3 (below) = 9.
    expect([tpo.val, tpo.vah]).toEqual([100, 104]);
    expect(tpo.initialBalance).toEqual({ high: 104, low: 100 });
    expect(tpo.sessionStart).toBe(t0);
  });
  it("letters run A–Z then a–z", () => {
    expect([tpoLetter(0), tpoLetter(25), tpoLetter(26), tpoLetter(51), tpoLetter(52)]).toEqual(["A", "Z", "a", "z", "A"]);
  });
});
