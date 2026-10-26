import { describe, it, expect } from "vitest";
import type { Anchor, Bar, BuiltinDrawingType, Drawing, DrawingType } from "../src/types";
import { DRAWING_ANCHORS } from "../src/types";
import {
  FIB_RATIOS,
  channelLines,
  distanceToLine,
  distanceToRay,
  distanceToSegment,
  fibLevels,
  hitTestDrawing,
  measureStats,
  nearestBarIndex,
  snapToBar,
  textBox,
} from "../src/drawings/geometry";

// Simple linear projection: x = time, y = 500 − price (price grows upward on screen).
const toPx = (a: Anchor) => ({ x: a.time, y: 500 - a.price });
const VIEW = { width: 800, height: 600 };
const A = (time: number, price: number): Anchor => ({ time, price });
const drawing = (type: DrawingType, anchors: Anchor[], text?: string): Drawing => ({ id: type, type, anchors, text });
const hit = (d: Drawing, x: number, y: number, tol = 6) => hitTestDrawing(d, toPx, x, y, tol, VIEW);

describe("distances", () => {
  it("segment: perpendicular, endpoints and beyond", () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToSegment(-3, 4, 0, 0, 10, 0)).toBe(5); // nearest is endpoint (0,0)
    expect(distanceToSegment(13, 4, 0, 0, 10, 0)).toBe(5); // nearest is endpoint (10,0)
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBe(5); // degenerate segment
    expect(distanceToSegment(0, 0, 0, 0, 10, 10)).toBe(0);
    expect(distanceToSegment(0, 2, -1, 1, 1, -1)).toBeCloseTo(Math.SQRT2, 12); // diagonal
  });

  it("ray: unbounded past point 2, bounded behind point 1", () => {
    expect(distanceToRay(100, 3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToRay(-3, 4, 0, 0, 10, 0)).toBe(5);
  });

  it("line: unbounded in both directions", () => {
    expect(distanceToLine(100, 3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToLine(-100, -3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToLine(0, 10, 0, 0, 10, 10)).toBeCloseTo(Math.SQRT2 * 5, 12);
  });
});

describe("fibLevels", () => {
  it("0 at b, 1 at a, retracing from b toward a", () => {
    const lv = fibLevels(A(0, 100), A(10, 200));
    expect(lv.map((l) => l.ratio)).toEqual([...FIB_RATIOS]);
    expect(lv[0].price).toBe(200);
    expect(lv[6].price).toBe(100);
    expect(lv[1].price).toBeCloseTo(176.4, 10);
    expect(lv[2].price).toBeCloseTo(161.8, 10);
    expect(lv[3].price).toBeCloseTo(150, 10);
    expect(lv[4].price).toBeCloseTo(138.2, 10);
    expect(lv[5].price).toBeCloseTo(121.4, 10);
  });

  it("works for a down move", () => {
    const lv = fibLevels(A(0, 200), A(10, 100));
    expect(lv[0].price).toBe(100);
    expect(lv[3].price).toBeCloseTo(150, 10);
    expect(lv[6].price).toBe(200);
  });
});

describe("channelLines", () => {
  it("parallel copy shifted in price through c", () => {
    const [base, par] = channelLines(A(0, 100), A(100, 200), A(50, 120));
    expect(base).toEqual([A(0, 100), A(100, 200)]);
    // base at t=50 is 150 → offset −30
    expect(par).toEqual([A(0, 70), A(100, 170)]);
  });

  it("vertical base line shifts in time", () => {
    const [, par] = channelLines(A(10, 100), A(10, 200), A(40, 150));
    expect(par).toEqual([A(40, 100), A(40, 200)]);
  });
});

describe("measureStats", () => {
  it("price change, percent, bars and duration", () => {
    const s = measureStats(A(1000, 100), A(1000 + 3600 * 5, 110), 3600);
    expect(s.priceChange).toBe(10);
    expect(s.percentChange).toBeCloseTo(10, 12);
    expect(s.bars).toBe(5);
    expect(s.durationSeconds).toBe(18000);
  });

  it("negative moves and zero base", () => {
    const s = measureStats(A(7200, 50), A(0, 40), 3600);
    expect(s.priceChange).toBe(-10);
    expect(s.percentChange).toBeCloseTo(-20, 12);
    expect(s.bars).toBe(-2);
    expect(measureStats(A(0, 0), A(1, 5), 60).percentChange).toBe(0);
  });
});

describe("hitTestDrawing", () => {
  it("anchor handles win and report the nearest index", () => {
    const d = drawing("trendline", [A(100, 400), A(110, 400)]);
    expect(hit(d, 101, 100)).toEqual({ hit: true, anchorIndex: 0 });
    expect(hit(d, 108, 100)).toEqual({ hit: true, anchorIndex: 1 });
  });

  it("tolerance edge: exactly at tolerance hits, just beyond misses", () => {
    const d = drawing("trendline", [A(100, 400), A(300, 400)]); // y = 100
    expect(hit(d, 200, 106)).toEqual({ hit: true, anchorIndex: null });
    expect(hit(d, 200, 106.01).hit).toBe(false);
    expect(hit(d, 200, 110, 10).hit).toBe(true);
  });

  it("trendline", () => {
    const d = drawing("trendline", [A(100, 400), A(300, 200)]); // (100,100) → (300,300)
    expect(hit(d, 200, 203).hit).toBe(true);
    expect(hit(d, 400, 400).hit).toBe(false); // beyond the end
    expect(hit(d, 200, 230).hit).toBe(false);
  });

  it("ray", () => {
    const d = drawing("ray", [A(100, 400), A(200, 400)]);
    expect(hit(d, 700, 102).hit).toBe(true); // past anchor 2
    expect(hit(d, 50, 100).hit).toBe(false); // behind anchor 1
  });

  it("extended", () => {
    const d = drawing("extended", [A(100, 400), A(200, 400)]);
    expect(hit(d, 700, 102).hit).toBe(true);
    expect(hit(d, 10, 98).hit).toBe(true);
    expect(hit(d, 10, 120).hit).toBe(false);
  });

  it("hline spans the full width", () => {
    const d = drawing("hline", [A(400, 300)]); // y = 200
    expect(hit(d, 5, 204)).toEqual({ hit: true, anchorIndex: null });
    expect(hit(d, 790, 196).hit).toBe(true);
    expect(hit(d, 400, 200)).toEqual({ hit: true, anchorIndex: 0 });
    expect(hit(d, 5, 210).hit).toBe(false);
    expect(hit(d, 900, 200).hit).toBe(false); // outside the viewport
    expect(hitTestDrawing(d, toPx, 5000, 200).hit).toBe(true); // no viewport: unbounded
  });

  it("hray extends rightward only", () => {
    const d = drawing("hray", [A(400, 300)]);
    expect(hit(d, 700, 202).hit).toBe(true);
    expect(hit(d, 300, 200).hit).toBe(false);
    expect(hit(d, 700, 220).hit).toBe(false);
  });

  it("vline", () => {
    const d = drawing("vline", [A(400, 300)]);
    expect(hit(d, 404, 10).hit).toBe(true);
    expect(hit(d, 404, 590).hit).toBe(true);
    expect(hit(d, 420, 10).hit).toBe(false);
  });

  it("rectangle: border hits, interior misses", () => {
    const d = drawing("rectangle", [A(100, 400), A(300, 200)]); // x 100..300, y 100..300
    expect(hit(d, 200, 103)).toEqual({ hit: true, anchorIndex: null }); // top edge
    expect(hit(d, 297, 200).hit).toBe(true); // right edge
    expect(hit(d, 200, 296).hit).toBe(true); // bottom edge
    expect(hit(d, 104, 200).hit).toBe(true); // left edge
    expect(hit(d, 200, 200).hit).toBe(false); // interior
    expect(hit(d, 400, 200).hit).toBe(false); // outside
    expect(hit(d, 300, 100)).toEqual({ hit: true, anchorIndex: null }); // opposite corner is not a handle
  });

  it("channel: both lines hit, between misses", () => {
    // base (100,100)→(300,100); parallel through c at price 300 → y 200
    const d = drawing("channel", [A(100, 400), A(300, 400), A(200, 300)]);
    expect(hit(d, 150, 102).hit).toBe(true);
    expect(hit(d, 150, 198).hit).toBe(true);
    expect(hit(d, 200, 200)).toEqual({ hit: true, anchorIndex: 2 });
    expect(hit(d, 150, 150).hit).toBe(false);
    expect(hit(d, 400, 200).hit).toBe(false); // beyond the segment end
  });

  it("fib: every level line hits within the anchors' x-range", () => {
    const a = A(100, 400); // y 100
    const b = A(300, 200); // y 300
    const d = drawing("fib", [a, b]);
    for (const lvl of fibLevels(a, b)) {
      const y = 500 - lvl.price;
      expect(hit(d, 250, y + 3).hit, `level ${lvl.ratio}`).toBe(true);
    }
    expect(hit(d, 400, 300 - 0.5 * 200).hit).toBe(false); // right of range
    // between the .5 (y 200) and .618 (y 176.4) lines, off the diagonal
    expect(hit(d, 120, 188).hit).toBe(false);
  });

  it("measure: whole rectangle area", () => {
    const d = drawing("measure", [A(100, 400), A(300, 200)]);
    expect(hit(d, 200, 200)).toEqual({ hit: true, anchorIndex: null });
    expect(hit(d, 305, 200).hit).toBe(true);
    expect(hit(d, 320, 200).hit).toBe(false);
  });

  it("text: box around the anchor", () => {
    const d = drawing("text", [A(100, 400)], "Hello");
    const box = textBox("Hello", { x: 100, y: 100 });
    expect(hit(d, 100 + box.width - 2, 110)).toEqual({ hit: true, anchorIndex: null });
    expect(hit(d, 100 + box.width + 20, 110).hit).toBe(false);
    expect(hit(d, 120, 100 + box.height + 20).hit).toBe(false);
  });

  it("incomplete drawings only hit their handles", () => {
    const d = drawing("trendline", [A(100, 400)]);
    expect(hit(d, 100, 100)).toEqual({ hit: true, anchorIndex: 0 });
    expect(hit(d, 200, 100).hit).toBe(false);
  });

  it("every drawing type has a hit and a miss", () => {
    const anchors: Record<BuiltinDrawingType, Anchor[]> = {
      trendline: [A(100, 400), A(300, 200)],
      ray: [A(100, 400), A(300, 200)],
      extended: [A(100, 400), A(300, 200)],
      hline: [A(200, 300)],
      hray: [A(200, 300)],
      vline: [A(200, 300)],
      rectangle: [A(100, 400), A(300, 200)],
      channel: [A(100, 400), A(300, 200), A(200, 250)],
      fib: [A(100, 400), A(300, 200)],
      measure: [A(100, 400), A(300, 200)],
      text: [A(200, 300)],
      vprofile: [A(100, 400), A(300, 200)],
      avprofile: [A(200, 300)],
    };
    for (const type of Object.keys(DRAWING_ANCHORS) as BuiltinDrawingType[]) {
      const d = drawing(type, anchors[type], "Note");
      expect(d.anchors).toHaveLength(DRAWING_ANCHORS[type]);
      const p = toPx(d.anchors[0]);
      expect(hit(d, p.x + 2, p.y + 2).hit, `${type} hit`).toBe(true);
      expect(hit(d, 760, 580).hit, `${type} miss`).toBe(false);
    }
  });
});

describe("magnet", () => {
  const bars: Bar[] = [
    { time: 0, open: 10, high: 15, low: 8, close: 12, volume: 1 },
    { time: 60, open: 12, high: 20, low: 11, close: 19, volume: 1 },
    { time: 120, open: 19, high: 22, low: 17, close: 18, volume: 1 },
  ];

  it("nearestBarIndex", () => {
    expect(nearestBarIndex(bars, -50)).toBe(0);
    expect(nearestBarIndex(bars, 29)).toBe(0);
    expect(nearestBarIndex(bars, 31)).toBe(1);
    expect(nearestBarIndex(bars, 1000)).toBe(2);
    expect(nearestBarIndex([], 5)).toBe(-1);
  });

  it("snaps time to the bar and price to the nearest OHLC", () => {
    expect(snapToBar(A(65, 19.8), bars)).toEqual(A(60, 20));
    expect(snapToBar(A(55, 11.4), bars)).toEqual(A(60, 11));
    expect(snapToBar(A(130, 18.4), bars)).toEqual(A(120, 18));
    expect(snapToBar(A(0, 9.5), bars, toPx)).toEqual(A(0, 10));
    const anchor = A(5, 5);
    expect(snapToBar(anchor, [])).toBe(anchor);
  });

  it("uses pixel distance when a projection is given (log scale)", () => {
    const logPx = (a: Anchor) => ({ x: a.time, y: -Math.log(a.price) * 100 });
    // price 14: linear-nearest of {10,15,8,12} is 15; log-nearest is also 15 (ln 14 closer to ln 15)
    expect(snapToBar(A(0, 14), bars, logPx).price).toBe(15);
    // price 9.1: linear → 10 (0.9) vs 8 (1.1); log: |ln9.1−ln10|=0.094, |ln9.1−ln8|=0.129 → 10
    expect(snapToBar(A(0, 9.1), bars, logPx).price).toBe(10);
  });
});

describe("visibility by interval", () => {
  it("maps intervals to groups and hides only explicitly disabled groups", async () => {
    const { intervalGroup, visibleOnInterval } = await import("../src/visibility");
    expect(["1m", "15m", "1h", "4h", "1D", "1W", "1M"].map((i) => intervalGroup(i as never))).toEqual([
      "minutes", "minutes", "hours", "hours", "days", "weeks", "months",
    ]);
    expect(visibleOnInterval(undefined, "1m")).toBe(true);
    expect(visibleOnInterval({ minutes: false }, "5m")).toBe(false);
    expect(visibleOnInterval({ minutes: false }, "1h")).toBe(true);
    expect(visibleOnInterval({ days: true, weeks: false }, "1W")).toBe(false);
  });
});

describe("fib levels from drawing style", () => {
  it("uses visible custom levels, defaults otherwise", async () => {
    const { drawingFibRatios, FIB_RATIOS } = await import("../src/drawings/geometry");
    const base = { id: "f", type: "fib" as const, anchors: [] };
    expect(drawingFibRatios(base)).toEqual([...FIB_RATIOS]);
    expect(drawingFibRatios({ ...base, style: { levels: [{ ratio: 0 }, { ratio: 0.5, visible: false }, { ratio: 1.618 }] } })).toEqual([0, 1.618]);
  });
});
