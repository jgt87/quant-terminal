import { describe, expect, it } from "vitest";
import type { Drawing } from "../src/types";
import {
  ALERT_BAND_TYPES,
  alertOperatorsFor,
  defaultAlertOperator,
  DRAWING_ALERTS,
  drawingAlertKind,
  drawingAlertValue,
  fibExtensionPrices,
  fibRetracementPrices,
  lineCoversTime,
  linePriceAt,
} from "../src/drawings/alerts";

const A = (time: number, price: number) => ({ time, price });

describe("drawing alerts: the shared list", () => {
  it("lists the alert-capable types with their kind and shape", () => {
    expect(Object.keys(DRAWING_ALERTS).sort()).toEqual(
      ["arrow", "channel", "disjointChannel", "extended", "fib", "fibExtension", "flatBottom", "hline", "hray", "infoline", "ray", "rectangle", "trendangle", "trendline", "vline"].sort(),
    );
    expect([...ALERT_BAND_TYPES].sort()).toEqual(["channel", "disjointChannel", "flatBottom", "rectangle"]);
    expect(drawingAlertKind("fib")).toBe("line");
    expect(drawingAlertKind("crossline")).toBeUndefined();
    expect(drawingAlertKind("regressionTrend")).toBeUndefined();
  });

  it("operators per shape, default operator per type", () => {
    expect(alertOperatorsFor("trendline")).toContain("greater");
    expect(alertOperatorsFor("fib")).toEqual(["crosses", "crosses-up", "crosses-down"]);
    expect(alertOperatorsFor("vline")).toEqual(["crosses"]);
    expect(alertOperatorsFor("rectangle")?.[0]).toBe("enters-channel");
    expect(alertOperatorsFor("nope")).toBeNull();
    expect(alertOperatorsFor(undefined)).toBeNull();
    expect(defaultAlertOperator("channel")).toBe("enters-channel");
    expect(defaultAlertOperator("infoline")).toBe("crosses");
    expect(defaultAlertOperator(undefined)).toBe("crosses");
  });
});

describe("drawing alerts: line geometry", () => {
  const a = A(100, 10);
  const b = A(200, 20);
  it("segment, extend past the first / second anchor, either anchor order", () => {
    expect(lineCoversTime(a, b, 150, false, false)).toBe(true);
    expect(lineCoversTime(a, b, 50, false, false)).toBe(false);
    expect(lineCoversTime(a, b, 50, true, false)).toBe(true);
    expect(lineCoversTime(a, b, 250, false, true)).toBe(true);
    expect(lineCoversTime(a, b, 250, true, false)).toBe(false);
    // Drawn right to left: "left" still extends past the first anchor (later times).
    expect(lineCoversTime(b, a, 250, true, false)).toBe(true);
    expect(lineCoversTime(b, a, 50, false, true)).toBe(true);
    expect(lineCoversTime(a, A(100, 30), 100, true, true)).toBe(false); // vertical
    expect(linePriceAt(a, b, 150, false, false)).toBeCloseTo(15);
    expect(linePriceAt(a, b, 300, true, true)).toBeCloseTo(30);
    expect(linePriceAt(a, b, 300, false, false)).toBeNull();
  });

  it("per-type defaults: trendline segment, ray right, extended both ways; props override", () => {
    const t: Drawing = { id: "1", type: "trendline", anchors: [a, b] };
    expect(drawingAlertValue(t, 300)).toBeNull();
    expect(drawingAlertValue({ ...t, type: "ray" }, 300)).toBeCloseTo(30);
    expect(drawingAlertValue({ ...t, type: "ray" }, 0)).toBeNull();
    expect(drawingAlertValue({ ...t, type: "extended" }, 0)).toBeCloseTo(0);
    expect(drawingAlertValue({ ...t, type: "ray", props: { extendRight: false } }, 300)).toBeNull();
    for (const type of ["infoline", "trendangle", "arrow"]) {
      expect(drawingAlertValue({ ...t, type }, 150)).toBeCloseTo(15);
      expect(drawingAlertValue({ ...t, type, props: { extendLeft: true } }, 0)).toBeCloseTo(0);
    }
  });

  it("horizontal line, horizontal ray, vertical line", () => {
    expect(drawingAlertValue({ id: "h", type: "hline", anchors: [a] }, -1e9)).toBe(10);
    expect(drawingAlertValue({ id: "h", type: "hray", anchors: [a] }, 99)).toBeNull();
    expect(drawingAlertValue({ id: "h", type: "hray", anchors: [a] }, 100)).toBe(10);
    expect(drawingAlertValue({ id: "v", type: "vline", anchors: [a] }, 150)).toEqual({ time: 100, at: 150 });
  });
});

describe("drawing alerts: levels and bands", () => {
  it("fib retracement levels: visible rows, reverse, log scale, span and extends", () => {
    const f: Drawing = { id: "f", type: "fib", anchors: [A(0, 100), A(10, 200)] };
    expect(fibRetracementPrices(f).map((p) => +p.toFixed(1))).toEqual([200, 176.4, 161.8, 150, 138.2, 121.4, 100]);
    expect(fibRetracementPrices({ ...f, props: { reverse: true } })[0]).toBe(100);
    const log = fibRetracementPrices({ ...f, props: { fibLevelsBasedOnLogScale: true } });
    expect(log[3]).toBeCloseTo(Math.sqrt(100 * 200)); // 0.5 in log space
    const rows = { levels: [{ ratio: 0.5, color: "#fff", visible: true }, { ratio: 0.618, color: "#fff", visible: false }] };
    expect(fibRetracementPrices({ ...f, style: rows })).toEqual([150]);
    expect(drawingAlertValue(f, 5)).toEqual({ levels: fibRetracementPrices(f) });
    expect(drawingAlertValue(f, 11)).toBeNull();
    expect(drawingAlertValue({ ...f, props: { extendLines: true } }, 11)).not.toBeNull();
    expect(drawingAlertValue({ ...f, props: { extendLinesLeft: true } }, -5)).not.toBeNull();
    expect(drawingAlertValue({ ...f, style: { fibLevels: false } }, 5)).toBeNull();
  });

  it("fib extension levels from the third anchor over |C − A| (or extended)", () => {
    const e: Drawing = { id: "e", type: "fibExtension", anchors: [A(0, 100), A(5, 120), A(10, 110)] };
    const prices = fibExtensionPrices(e);
    expect(prices[0]).toBe(110);
    expect(prices[6]).toBe(130); // coefficient 1
    expect(drawingAlertValue(e, 15)).toEqual({ levels: prices });
    expect(drawingAlertValue(e, 21)).toBeNull();
    expect(drawingAlertValue(e, 9)).toBeNull();
    expect(drawingAlertValue({ ...e, props: { extendLines: true } }, 50)).not.toBeNull();
  });

  it("channels and rectangles give their band where drawn", () => {
    const c: Drawing = { id: "c", type: "channel", anchors: [A(0, 10), A(10, 20), A(5, 30)] };
    expect(drawingAlertValue(c, 5)).toEqual({ lo: 15, hi: 30 });
    expect(drawingAlertValue(c, 20)).toBeNull();
    expect(drawingAlertValue({ ...c, props: { extendRight: true } }, 20)).toEqual({ lo: 30, hi: 45 });
    expect(drawingAlertValue({ ...c, type: "flatBottom" }, 5)).toEqual({ lo: 15, hi: 30 });
    expect(drawingAlertValue({ ...c, type: "disjointChannel" }, 0)).toEqual({ lo: 10, hi: 30 });
    expect(drawingAlertValue({ ...c, type: "disjointChannel" }, 10)).toEqual({ lo: 20, hi: 20 });
    const r: Drawing = { id: "r", type: "rectangle", anchors: [A(10, 5), A(0, 9)] };
    expect(drawingAlertValue(r, 5)).toEqual({ lo: 5, hi: 9 });
    expect(drawingAlertValue(r, 11)).toBeNull();
    expect(drawingAlertValue({ ...r, props: { extendLeft: true } }, -100)).toEqual({ lo: 5, hi: 9 });
    expect(drawingAlertValue({ ...r, props: { extendLeft: true } }, 11)).toBeNull();
  });

  it("incomplete or unknown drawings have no value", () => {
    expect(drawingAlertValue({ id: "c", type: "channel", anchors: [A(0, 1), A(1, 2)] }, 0)).toBeNull();
    expect(drawingAlertValue({ id: "x", type: "regressionTrend", anchors: [A(0, 1), A(1, 2)] }, 0)).toBeNull();
    expect(drawingAlertValue({ id: "x", type: "trendline", anchors: [] }, 0)).toBeNull();
  });
});
