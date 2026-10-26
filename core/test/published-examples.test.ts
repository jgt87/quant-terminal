import { describe, expect, it } from "vitest";
import { rsi } from "../src/indicators";

// Classic RSI(14) worked example (Wilder smoothing) as published in common technical-analysis references.
// The published table is computed from 4-decimal closes (it displays them rounded to 2 decimals).
const closes = [
  44.3389, 44.0902, 44.1497, 43.6124, 44.2779, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614,
  46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515, 45.7835, 45.3548,
  44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314,
];
const published = [
  70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3,
  33.08, 37.77,
];

describe("published worked examples", () => {
  it("RSI(14) matches the published Wilder table to 2 decimals", () => {
    const out = rsi(closes, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    const got = out.slice(14).map((v) => Math.round((v as number) * 100) / 100);
    expect(got).toEqual(published);
  });
});
