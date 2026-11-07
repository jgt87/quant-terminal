import { describe, expect, it } from "vitest";
import type { OptionRow } from "@qt/core";
import { daysTo, expiryLabel, inTheMoney, linear, measureMax, niceTicks, rowsAroundMoney, shortNumber } from "../src/panels/options/optionsModel";

const row = (strike: number, oi = 0, vol = 0): OptionRow => ({ strike, call: { symbol: "c", bid: null, ask: null, last: null, volume: vol, openInterest: oi, mark: null, iv: null, delta: null, gamma: null, theta: null, vega: null }, put: null });

describe("options panel model", () => {
  it("windows rows around the money and sizes bars", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((s) => row(s * 10, s, 10 - s));
    expect(rowsAroundMoney(rows, 40, 1).map((r) => r.strike)).toEqual([30, 40, 50]);
    expect(rowsAroundMoney(rows, 10, 2).map((r) => r.strike)).toEqual([10, 20, 30]);
    expect(rowsAroundMoney(rows, null, 1)).toHaveLength(7);
    expect(measureMax(rows, "openInterest")).toBe(7);
    expect(measureMax(rows, "volume")).toBe(9);
  });

  it("knows the money side, expiry labels, ticks and short numbers", () => {
    expect(inTheMoney("call", 70, 80)).toBe(true);
    expect(inTheMoney("put", 70, 80)).toBe(false);
    expect(inTheMoney("put", 90, 80)).toBe(true);
    expect(inTheMoney("call", 70, null)).toBe(false);
    const exp = Date.UTC(2026, 11, 25, 8);
    expect(daysTo(exp, exp - 2 * 86_400_000)).toBe(2);
    expect(expiryLabel(exp, exp - 49 * 86_400_000)).toBe("25 Dec 2026 (49 d)");
    expect(expiryLabel(exp, exp - 3_600_000)).toBe("25 Dec 2026 (< 1 d)");
    expect(niceTicks(0.31, 0.78, 4)).toEqual([0.4, 0.6]);
    expect(niceTicks(60000, 110000, 4)).toEqual([60000, 80000, 100000]);
    expect(linear(0, 10, 0, 100)(2.5)).toBe(25);
    expect(shortNumber(85000)).toBe("85K");
    expect(shortNumber(1250000)).toBe("1.25M");
    expect(shortNumber(0.25)).toBe("0.25");
  });
});
