import { describe, expect, it } from "vitest";
import { distanceToCross, distanceToExtendedSegment, formatSpan, infoLineStats, pipSizeFor, screenAngleDeg, trendAngleDeg } from "../src/drawings/lines";

describe("lines: extended segment distance", () => {
  const p = { x: 100, y: 100 };
  const q = { x: 200, y: 100 };
  it("segment hits between the ends and misses beyond", () => {
    expect(distanceToExtendedSegment(150, 103, p, q, false, false)).toBeCloseTo(3);
    expect(distanceToExtendedSegment(300, 100, p, q, false, false)).toBeCloseTo(100);
  });
  it("extend right reaches beyond the second point only", () => {
    expect(distanceToExtendedSegment(300, 100, p, q, false, true)).toBeCloseTo(0);
    expect(distanceToExtendedSegment(0, 100, p, q, false, true)).toBeCloseTo(100);
  });
  it("extend left reaches beyond the first point only; both = infinite line", () => {
    expect(distanceToExtendedSegment(0, 100, p, q, true, false)).toBeCloseTo(0);
    expect(distanceToExtendedSegment(300, 100, p, q, true, false)).toBeCloseTo(100);
    expect(distanceToExtendedSegment(-500, 100, p, q, true, true)).toBeCloseTo(0);
    expect(distanceToExtendedSegment(900, 120, p, q, true, true)).toBeCloseTo(20);
  });
});

describe("lines: trend angle", () => {
  it("screen angle: rising to the right is positive (screen y grows down)", () => {
    expect(screenAngleDeg({ x: 0, y: 100 }, { x: 100, y: 0 })).toBeCloseTo(45);
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(-45);
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: 0, y: -50 })).toBeCloseTo(90);
    expect(screenAngleDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
  });
  it("data angle depends on the price/time scale and equals the projected screen angle", () => {
    const a = { time: 0, price: 100 };
    const b = { time: 3600, price: 110 };
    // 1 px per minute horizontally, 6 px per price unit: dx = 60, dy = 60 → 45°.
    expect(trendAngleDeg(a, b, 1 / 60, 6)).toBeCloseTo(45);
    // Doubling the vertical scale steepens the line: atan(2) = 63.43°.
    expect(trendAngleDeg(a, b, 1 / 60, 12)).toBeCloseTo(63.4349, 3);
    const toPx = (x: { time: number; price: number }) => ({ x: x.time / 60, y: 500 - x.price * 12 });
    expect(screenAngleDeg(toPx(a), toPx(b))).toBeCloseTo(trendAngleDeg(a, b, 1 / 60, 12), 9);
    expect(trendAngleDeg(b, a, 1 / 60, 6)).toBeCloseTo(-135);
  });
});

describe("lines: info line stats", () => {
  it("price change, percent, pips, bars, time span, distance, angle", () => {
    const s = infoLineStats({ time: 0, price: 1.1 }, { time: 7200, price: 1.1055 }, { x: 0, y: 40 }, { x: 30, y: 0 }, 900, pipSizeFor(5));
    expect(s.priceChange).toBeCloseTo(0.0055, 10);
    expect(s.percentChange).toBeCloseTo(0.5, 6);
    expect(s.pips).toBe(55);
    expect(s.bars).toBe(8);
    expect(s.seconds).toBe(7200);
    expect(s.distancePx).toBeCloseTo(50);
    expect(s.angleDeg).toBeCloseTo((Math.atan2(40, 30) * 180) / Math.PI);
  });
  it("falling move, zero start price and missing bar size are safe", () => {
    const s = infoLineStats({ time: 100, price: 0 }, { time: 40, price: -2 }, { x: 10, y: 10 }, { x: 0, y: 10 }, 0, 1);
    expect(s.percentChange).toBe(0);
    expect(s.bars).toBe(0);
    expect(s.pips).toBe(-2);
    expect(s.seconds).toBe(-60);
    expect(s.angleDeg).toBe(180);
  });
  it("pip size and span formatting", () => {
    expect(pipSizeFor(5)).toBeCloseTo(0.0001);
    expect(pipSizeFor(2)).toBeCloseTo(0.1);
    expect(pipSizeFor(0)).toBe(1);
    expect(formatSpan(3 * 86400 + 4 * 3600)).toBe("3d 4h");
    expect(formatSpan(-(5 * 3600 + 30 * 60))).toBe("5h 30m");
    expect(formatSpan(45 * 60)).toBe("45m");
    expect(formatSpan(20)).toBe("20s");
    expect(formatSpan(86400)).toBe("1d");
  });
});

describe("lines: cross line", () => {
  it("hits either line through the point, misses away from both", () => {
    const p = { x: 200, y: 300 };
    expect(distanceToCross(700, 302, p)).toBe(2);
    expect(distanceToCross(203, 10, p)).toBe(3);
    expect(distanceToCross(260, 340, p)).toBe(40);
  });
});
