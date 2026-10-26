import { describe, expect, it } from "vitest";
import {
  ELLIOTT_DEFAULT_DEGREE,
  ELLIOTT_DEGREES,
  ELLIOTT_NOTATION,
  clampDegree,
  distanceToWave,
  elliottLabelPosition,
  elliottLabels,
  elliottLabelSides,
  hitElliott,
  labelFor,
} from "../src/drawings/elliott";

describe("elliott degrees", () => {
  it("has 15 degrees, Intermediate default, one notation each, all distinct", () => {
    expect(ELLIOTT_DEGREES).toHaveLength(15);
    expect(ELLIOTT_NOTATION).toHaveLength(15);
    expect(ELLIOTT_DEGREES[ELLIOTT_DEFAULT_DEGREE]).toBe("Intermediate");
    const keys = ELLIOTT_NOTATION.map((n) => `${n.numerals}/${n.upperLetters}/${n.wrap}`);
    expect(new Set(keys).size).toBe(15);
  });

  it("clamps and defaults degree values", () => {
    expect(clampDegree(undefined)).toBe(7);
    expect(clampDegree(-3)).toBe(0);
    expect(clampDegree(99)).toBe(14);
    expect(clampDegree(3.4)).toBe(3);
  });
});

describe("elliott labels", () => {
  it("impulse labels per degree", () => {
    expect(elliottLabels(7, "impulse").map((l) => l.text)).toEqual(["(1)", "(2)", "(3)", "(4)", "(5)"]);
    expect(elliottLabels(8, "impulse").map((l) => l.text)).toEqual(["1", "2", "3", "4", "5"]);
    expect(elliottLabels(5, "impulse").map((l) => l.text)).toEqual(["I", "II", "III", "IV", "V"]);
    expect(elliottLabels(3, "impulse")[3].text).toBe("((IV))");
    expect(elliottLabels(0, "impulse")[0].text).toBe("[[I]]");
    expect(elliottLabels(1, "impulse")[0].text).toBe("[I]");
    expect(elliottLabels(10, "impulse").map((l) => l.text)).toEqual(["(i)", "(ii)", "(iii)", "(iv)", "(v)"]);
    const primary = labelFor(6, "impulse", 3);
    expect(primary).toEqual({ text: "3", circled: true });
  });

  it("corrective letters change case with degree", () => {
    expect(elliottLabels(7, "correction").map((l) => l.text)).toEqual(["(A)", "(B)", "(C)"]);
    expect(elliottLabels(11, "correction").map((l) => l.text)).toEqual(["a", "b", "c"]);
    expect(elliottLabels(8, "triangle").map((l) => l.text)).toEqual(["A", "B", "C", "D", "E"]);
    expect(elliottLabels(8, "doubleCombo").map((l) => l.text)).toEqual(["W", "X", "Y"]);
    expect(elliottLabels(8, "tripleCombo").map((l) => l.text)).toEqual(["W", "X", "Y", "X", "Z"]);
    expect(labelFor(8, "correction", 9).text).toBe("");
  });
});

describe("elliott label placement", () => {
  it("highs above, lows below", () => {
    // 0 low, 1 high, 2 low, 3 high, 4 low, 5 high
    expect(elliottLabelSides([10, 20, 15, 30, 25, 35])).toEqual(["below", "above", "below", "above", "below", "above"]);
    // Down impulse.
    expect(elliottLabelSides([35, 25, 30, 15, 20, 10])).toEqual(["above", "below", "above", "below", "above", "below"]);
    expect(elliottLabelSides([5])).toEqual(["above"]);
    // Mid-leg point follows the leg direction.
    expect(elliottLabelSides([10, 15, 20])).toEqual(["below", "above", "above"]);
  });

  it("label center sits above or below the point", () => {
    const above = elliottLabelPosition({ x: 50, y: 100 }, "above", 12, false);
    const below = elliottLabelPosition({ x: 50, y: 100 }, "below", 12, false);
    expect(above.y).toBeLessThan(100);
    expect(below.y).toBeGreaterThan(100);
    expect(above.x).toBe(50);
    expect(100 - elliottLabelPosition({ x: 0, y: 100 }, "above", 12, true).y).toBeGreaterThan(100 - above.y);
  });
});

describe("elliott hit-test", () => {
  const pts = [
    { x: 0, y: 100 },
    { x: 50, y: 0 },
    { x: 100, y: 60 },
  ];
  it("polyline distance", () => {
    expect(distanceToWave(pts, 25, 50)).toBeCloseTo(0, 5);
    expect(distanceToWave(pts, 50, 40)).toBeGreaterThan(10);
    expect(distanceToWave([{ x: 0, y: 0 }], 3, 4)).toBe(5);
  });
  it("wave and labels", () => {
    const labels = [{ center: { x: 50, y: -15 }, halfW: 8, halfH: 7 }];
    expect(hitElliott(pts, labels, true, 25, 51, 4)).toBe(true);
    expect(hitElliott(pts, labels, false, 25, 51, 4)).toBe(false);
    expect(hitElliott(pts, labels, false, 52, -14, 4)).toBe(true);
    expect(hitElliott(pts, labels, true, 300, 300, 4)).toBe(false);
  });
});
