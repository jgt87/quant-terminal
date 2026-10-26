import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { alignHigherTimeframe } from "../src/analysis/mtf";

const mk = (times: number[]): Bar[] => times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));

describe("alignHigherTimeframe", () => {
  const lower = mk(Array.from({ length: 12 }, (_, i) => i * 900)); // 15m bars, close at 900·(i+1)
  const higher = mk([0, 3600, 7200]); // 1h bars, close at 3600, 7200, 10800
  const values = [1, 2, 3];

  it("uses only completed higher bars", () => {
    const out = alignHigherTimeframe(lower, higher, values, "no-lookahead");
    // 00:00–00:30 bars close before the first hour closes → null; the 00:45 bar closes at 01:00 → 1.
    expect(out).toEqual([null, null, null, 1, 1, 1, 1, 2, 2, 2, 2, 3]);
  });

  it("never shows a value before its higher bar closed", () => {
    const out = alignHigherTimeframe(lower, higher, values);
    out.forEach((v, i) => {
      if (v === null) return;
      const higherClose = higher[v - 1].time + 3600;
      const lowerClose = lower[i].time + 900;
      expect(higherClose).toBeLessThanOrEqual(lowerClose);
    });
  });

  it("caps close times at the next bar's open across gaps and passes nulls through", () => {
    // Daily bars Fri (day 1) and Mon (day 4) with an explicit 1-day length; 12h lower bars.
    const D = 86400;
    const h = mk([1 * D, 4 * D]);
    const l = mk([1 * D, 1 * D + 43200, 2 * D, 4 * D, 4 * D + 43200]);
    const out = alignHigherTimeframe(l, h, [null, 7], "no-lookahead", { lowerSec: 43200, higherSec: D });
    // Friday closes at day 2 (its value is null); Monday's value appears only at Monday's close.
    expect(out).toEqual([null, null, null, null, 7]);
  });
});
