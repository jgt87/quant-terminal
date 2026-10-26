import { describe, expect, it } from "vitest";
import type { Alert, AlertCondition, AlertOperand, Bar, Drawing } from "@qt/core";
import { barCloseTime, conditionHolds, drawingValue, evaluateAlert, type AlertState, type EvalInput } from "../src/alerts/evaluate";

const DAY = 86400;
const T0 = Date.UTC(2026, 0, 5) / 1000; // a Monday, UTC midnight

/** Daily bars with the given closes (high = close + 1, low = close - 1). */
function bars(closes: number[], start = T0, step = DAY): Bar[] {
  return closes.map((c, i) => ({ time: start + i * step, open: c, high: c + 1, low: c - 1, close: c, volume: 100 + i }));
}

const price: AlertOperand = { kind: "price" };
const value = (v: number): AlertOperand => ({ kind: "value", value: v });
const cond = (op: AlertCondition["op"], right: AlertOperand = value(10), extra: Partial<AlertCondition> = {}, left: AlertOperand = price): AlertCondition => ({ left, op, right, ...extra });

function alert(conditions: AlertCondition[], extra: Partial<Alert> = {}): Alert {
  return {
    id: "a1", name: "test", symbol: "TEST", interval: "1D", conditions, trigger: "every-time", active: true, message: "",
    notify: { browser: true }, createdAt: 0, ...extra,
  };
}

/** Evaluate with "now" well after the last bar closed (all bars closed). */
function run(a: Alert, closes: number[], opts: Partial<EvalInput> = {}, state?: AlertState) {
  const b = opts.bars ?? bars(closes);
  const now = opts.now ?? (b[b.length - 1].time + 2 * DAY) * 1000;
  return evaluateAlert(a, { bars: b, interval: "1D", now, ...opts }, state);
}

describe("comparison operators", () => {
  it("greater / less against a value", () => {
    expect(run(alert([cond("greater")]), [5, 11]).fired).toBe(true);
    expect(run(alert([cond("greater")]), [5, 10]).fired).toBe(false); // equal is not greater
    expect(run(alert([cond("greater")]), [5, 9]).fired).toBe(false);
    expect(run(alert([cond("less")]), [15, 9]).fired).toBe(true);
    expect(run(alert([cond("less")]), [15, 10]).fired).toBe(false);
    expect(run(alert([cond("less")]), [15, 11]).fired).toBe(false);
  });

  it("price field high/low", () => {
    const hi = { kind: "price", field: "high" } as AlertOperand;
    const lo = { kind: "price", field: "low" } as AlertOperand;
    expect(run(alert([cond("greater", value(10.5), {}, hi)]), [10]).fired).toBe(true); // high 11
    expect(run(alert([cond("less", value(9.5), {}, lo)]), [10]).fired).toBe(true); // low 9
  });

  it("value vs value and price vs price", () => {
    expect(run(alert([cond("greater", value(1), {}, value(2))]), [1]).fired).toBe(true);
    expect(run(alert([cond("greater", price, {}, price)]), [1]).fired).toBe(false);
  });
});

describe("crossing operators (bar based)", () => {
  const up = (closes: number[]) => run(alert([cond("crosses-up")]), closes).fired;
  const down = (closes: number[]) => run(alert([cond("crosses-down")]), closes).fired;
  const any = (closes: number[]) => run(alert([cond("crosses")]), closes).fired;

  it("crosses-up: previous at or below, current above", () => {
    expect(up([9, 11])).toBe(true);
    expect(up([10, 11])).toBe(true); // from touching
    expect(up([11, 12])).toBe(false); // already above
    expect(up([9, 10])).toBe(false); // only touches
    expect(up([9, 8])).toBe(false);
    expect(up([11, 9])).toBe(false);
  });

  it("crosses-down: previous at or above, current below", () => {
    expect(down([11, 9])).toBe(true);
    expect(down([10, 9])).toBe(true);
    expect(down([9, 8])).toBe(false);
    expect(down([11, 10])).toBe(false);
    expect(down([9, 11])).toBe(false);
  });

  it("crosses: either direction", () => {
    expect(any([9, 11])).toBe(true);
    expect(any([11, 9])).toBe(true);
    expect(any([10, 10])).toBe(false);
    expect(any([11, 12])).toBe(false);
    expect(any([8, 9])).toBe(false);
  });

  it("needs a previous value", () => {
    expect(up([11])).toBe(false);
    expect(any([11])).toBe(false);
  });

  it("only the last two bars matter", () => {
    expect(up([5, 20, 9, 11])).toBe(true);
    expect(up([5, 20, 11, 12])).toBe(false);
  });

  it("crossing between two moving operands (indicator vs price)", () => {
    const sma: AlertOperand = { kind: "indicator", indicatorId: "sma", inputs: { length: 2 }, output: "sma" };
    // stub: a constant line at 10 from the indicator function
    const indicator = (_id: string, _inputs: unknown, _out: string, b: Bar[]) => b.map(() => 10);
    const a = alert([cond("crosses-up", sma)]);
    expect(run(a, [9, 11], { indicator }).fired).toBe(true);
    expect(run(a, [11, 12], { indicator }).fired).toBe(false);
  });

  it("indicator warm-up nulls never cross", () => {
    const ind: AlertOperand = { kind: "indicator", indicatorId: "x", inputs: {}, output: "x" };
    const indicator = (_id: string, _i: unknown, _o: string, b: Bar[]) => b.map((_, i) => (i < b.length - 1 ? null : 10));
    expect(run(alert([cond("crosses", ind)]), [9, 11], { indicator }).fired).toBe(false);
    expect(run(alert([cond("greater", ind)]), [9, 11], { indicator }).fired).toBe(true);
  });

  it("indicator without an indicator function reports an error", () => {
    const ind: AlertOperand = { kind: "indicator", indicatorId: "x", inputs: {}, output: "x" };
    const r = run(alert([cond("greater", ind)]), [9, 11]);
    expect(r.fired).toBe(false);
    expect(r.error).toMatch(/not available/);
  });
});

describe("crossing operators (between evaluations of a forming bar)", () => {
  const live = (closes: number[]) => {
    const b = bars(closes);
    return { bars: b, now: (b[b.length - 1].time + 3600) * 1000 }; // last bar is forming
  };

  it("uses the previous evaluation's values when it belongs to the current bar", () => {
    const a = alert([cond("crosses-up")]);
    const first = evaluateAlert(a, { ...live([9, 9.5]), interval: "1D" });
    expect(first.fired).toBe(false);
    const second = evaluateAlert(a, { ...live([9, 10.5]), interval: "1D" }, first.state);
    expect(second.fired).toBe(true); // 9.5 -> 10.5 within the bar
    const third = evaluateAlert(a, { ...live([9, 11]), interval: "1D" }, second.state);
    expect(third.fired).toBe(false); // stays above: no new cross even though the previous bar was below
  });

  it("falls back to the previous bar when the sample is older than that bar", () => {
    const a = alert([cond("crosses-up")]);
    const stale: AlertState = { sample: { barTime: T0 - 10 * DAY, values: [[20, 10]] } };
    expect(evaluateAlert(a, { ...live([9, 11]), interval: "1D" }, stale).fired).toBe(true);
  });

  it("a sample from the previous bar counts (cross at the bar boundary)", () => {
    const a = alert([cond("crosses-down")]);
    const prevBar: AlertState = { sample: { barTime: T0, values: [[10.2, 10]] } };
    // previous bar closed at 9 (below) but the last sample seen was 10.2 (above): crossing down now
    expect(evaluateAlert(a, { ...live([9, 9.8]), interval: "1D" }, prevBar).fired).toBe(true);
  });

  it("ignores a sample with a different number of conditions", () => {
    const a = alert([cond("crosses-up")]);
    const odd: AlertState = { sample: { barTime: T0 + DAY, values: [[11, 10], [1, 2]] } };
    expect(evaluateAlert(a, { ...live([9, 11]), interval: "1D" }, odd).fired).toBe(true);
  });
});

describe("drawings", () => {
  const hline: Drawing = { id: "h", type: "hline", anchors: [{ time: T0, price: 10 }] };
  const trend: Drawing = { id: "t", type: "trendline", anchors: [{ time: T0, price: 10 }, { time: T0 + DAY, price: 11 }] };
  const rect: Drawing = { id: "r", type: "rectangle", anchors: [{ time: T0, price: 12 }, { time: T0 + DAY, price: 8 }] };
  const chan: Drawing = { id: "c", type: "channel", anchors: [{ time: T0, price: 10 }, { time: T0 + DAY, price: 11 }, { time: T0, price: 14 }] };
  const drawings = new Map([hline, trend, rect, chan].map((d) => [d.id, d]));
  const d = (id: string): AlertOperand => ({ kind: "drawing", drawingId: id });

  it("drawingValue per type (drawn geometry: segments + extend flags)", () => {
    expect(drawingValue(hline, T0 + 99 * DAY)).toBe(10);
    expect(drawingValue({ ...hline, type: "hray" }, T0)).toBe(10);
    expect(drawingValue({ ...hline, type: "hray" }, T0 - DAY)).toBeNull(); // left of the ray
    expect(drawingValue(trend, T0 + DAY / 2)).toBeCloseTo(10.5); // on the segment
    expect(drawingValue(trend, T0 + 4 * DAY)).toBeNull(); // not extended
    expect(drawingValue({ ...trend, props: { extendRight: true } }, T0 + 4 * DAY)).toBeCloseTo(14);
    expect(drawingValue({ ...trend, props: { extendLeft: true } }, T0 - DAY)).toBeCloseTo(9);
    expect(drawingValue({ ...trend, type: "ray" }, T0 + 2 * DAY)).toBeCloseTo(12); // ray: right by default
    expect(drawingValue({ ...trend, type: "ray" }, T0 - DAY)).toBeNull();
    expect(drawingValue({ ...trend, type: "extended" }, T0 - DAY)).toBeCloseTo(9);
    expect(drawingValue(rect, T0 + DAY / 2)).toEqual({ lo: 8, hi: 12 });
    expect(drawingValue(rect, T0 + 50 * DAY)).toBeNull();
    expect(drawingValue({ ...rect, props: { extendRight: true } }, T0 + 50 * DAY)).toEqual({ lo: 8, hi: 12 });
    expect(drawingValue(chan, T0 + DAY)).toEqual({ lo: 11, hi: 15 });
    expect(drawingValue({ ...chan, props: { extendRight: true } }, T0 + 2 * DAY)).toEqual({ lo: 12, hi: 16 });
    expect(drawingValue({ id: "v", type: "trendline", anchors: [{ time: T0, price: 1 }, { time: T0, price: 2 }] }, T0)).toBeNull();
    expect(drawingValue({ id: "v", type: "vline", anchors: [{ time: T0, price: 1 }] }, T0 + DAY)).toEqual({ time: T0, at: T0 + DAY });
    expect(drawingValue({ id: "x", type: "trendline", anchors: [{ time: T0, price: 1 }] }, T0)).toBeNull();
    expect(drawingValue({ id: "z", type: "crossline", anchors: [{ time: T0, price: 1 }] }, T0)).toBeNull(); // no alert in the catalog
  });

  it("price crossing a horizontal line and a trendline evaluated at each bar time", () => {
    const ext: Drawing = { ...trend, id: "te", props: { extendRight: true } };
    const all = new Map([...drawings, [ext.id, ext]]);
    expect(run(alert([cond("crosses-up", d("h"))]), [9, 11], { drawings }).fired).toBe(true);
    // trendline: 10 at bar 0, 11 at bar 1 (12 at bar 2 when extended). closes 10.5 then 11.5: no cross
    expect(run(alert([cond("crosses", d("t"))]), [10.5, 11.5], { drawings }).fired).toBe(false);
    // 9.5 (below 10) then 11.5 (above 11): crossing up
    expect(run(alert([cond("crosses-up", d("t"))]), [9.5, 11.5], { drawings }).fired).toBe(true);
    // greater than the extended line at bar 2 (12)
    expect(run(alert([cond("greater", d("te"))]), [0, 0, 12.5], { drawings: all }).fired).toBe(true);
    expect(run(alert([cond("greater", d("te"))]), [0, 0, 11.5], { drawings: all }).fired).toBe(false);
    // Past the unextended segment the line has no value: nothing fires.
    expect(run(alert([cond("greater", d("t"))]), [0, 0, 12.5], { drawings }).fired).toBe(false);
  });

  it("enters-channel / exits-channel with a rectangle", () => {
    expect(run(alert([cond("enters-channel", d("r"))]), [13, 10], { drawings }).fired).toBe(true);
    expect(run(alert([cond("enters-channel", d("r"))]), [7, 8], { drawings }).fired).toBe(true); // boundary is inside
    expect(run(alert([cond("enters-channel", d("r"))]), [10, 11], { drawings }).fired).toBe(false); // already inside
    expect(run(alert([cond("enters-channel", d("r"))]), [13, 14], { drawings }).fired).toBe(false);
    expect(run(alert([cond("exits-channel", d("r"))]), [10, 13], { drawings }).fired).toBe(true);
    expect(run(alert([cond("exits-channel", d("r"))]), [10, 7], { drawings }).fired).toBe(true);
    expect(run(alert([cond("exits-channel", d("r"))]), [10, 12], { drawings }).fired).toBe(false);
    expect(run(alert([cond("exits-channel", d("r"))]), [13, 14], { drawings }).fired).toBe(false);
  });

  it("enters-channel with a sloped parallel channel", () => {
    // band at bar0 = [10,14], bar1 = [11,15]
    expect(run(alert([cond("enters-channel", d("c"))]), [9, 12], { drawings }).fired).toBe(true);
    expect(run(alert([cond("exits-channel", d("c"))]), [12, 10.5], { drawings }).fired).toBe(true);
  });

  it("channel operators need a band; greater/less need a number; crossing a band crosses either bound", () => {
    expect(run(alert([cond("enters-channel", d("h"))]), [13, 10], { drawings }).fired).toBe(false);
    expect(run(alert([cond("greater", d("r"))]), [13, 20], { drawings }).fired).toBe(false);
    expect(run(alert([cond("crosses", d("r"))]), [5, 20], { drawings }).fired).toBe(true);
    expect(run(alert([cond("crosses-down", d("r"))]), [13, 10], { drawings }).fired).toBe(true); // through 12
    expect(run(alert([cond("crosses-up", d("r"))]), [13, 10], { drawings }).fired).toBe(false);
    expect(run(alert([cond("crosses", d("r"))]), [9, 10], { drawings }).fired).toBe(false); // stays inside
  });

  it("a missing drawing reports an error and never fires", () => {
    const r = run(alert([cond("greater", d("nope"))]), [1, 2], { drawings });
    expect(r.fired).toBe(false);
    expect(r.error).toMatch(/Drawing not found/);
  });
});

describe("moving percent", () => {
  it("moving-up-pct over N bars, threshold inclusive", () => {
    const a = (pct: number, n: number) => alert([cond("moving-up-pct", value(0), { pct, bars: n })]);
    expect(run(a(10, 2), [100, 50, 110]).fired).toBe(true); // +10% vs 2 bars ago
    expect(run(a(10.01, 2), [100, 50, 110]).fired).toBe(false);
    expect(run(a(10, 1), [100, 105, 110]).fired).toBe(false); // +4.76% vs 1 bar ago
    expect(run(a(5, 5), [100, 110]).fired).toBe(false); // not enough history
  });

  it("moving-down-pct", () => {
    const a = (pct: number, n: number) => alert([cond("moving-down-pct", value(0), { pct, bars: n })]);
    expect(run(a(10, 1), [100, 90]).fired).toBe(true);
    expect(run(a(10, 1), [100, 91]).fired).toBe(false);
    expect(run(a(10, 1), [100, 120]).fired).toBe(false);
  });

  it("conditionHolds: zero base never triggers", () => {
    const c = cond("moving-up-pct", value(0), { pct: 1, bars: 1 });
    expect(conditionHolds(c, [5, 0], null, () => 0)).toBe(false);
  });
});

describe("multiple conditions (AND)", () => {
  it("fires only when every condition holds", () => {
    const both = alert([cond("greater", value(10)), cond("less", value(20))]);
    expect(run(both, [5, 15]).fired).toBe(true);
    expect(run(both, [5, 25]).fired).toBe(false);
    expect(run(both, [5, 5]).fired).toBe(false);
  });
});

describe("trigger modes", () => {
  const closes = [5, 11];
  const lastBar = T0 + DAY;

  it("once: fires and deactivates", () => {
    const r = run(alert([cond("greater")], { trigger: "once" }), closes);
    expect(r).toMatchObject({ fired: true, deactivate: true, price: 11, barTime: lastBar });
  });

  it("once-per-bar: at most once per bar", () => {
    const a = alert([cond("greater")], { trigger: "once-per-bar" });
    const live = { now: (lastBar + 3600) * 1000 };
    expect(run(a, closes, live).fired).toBe(true);
    expect(run({ ...a, lastFiredAt: (lastBar + 60) * 1000 }, closes, live).fired).toBe(false);
    expect(run({ ...a, lastFiredAt: (lastBar - 60) * 1000 }, closes, live).fired).toBe(true);
    expect(run(a, closes, live).deactivate).toBe(false);
  });

  it("every-time: fires on every new data point, not on repeated identical data", () => {
    const a = alert([cond("greater")], { trigger: "every-time" });
    const r1 = run(a, closes);
    expect(r1.fired).toBe(true);
    const r2 = run({ ...a, lastFiredAt: Date.now() }, closes, {}, r1.state);
    expect(r2.fired).toBe(false); // same bar time, close and volume
    const r3 = run(a, [5, 12], {}, r2.state);
    expect(r3.fired).toBe(true); // new close
    expect(r3.deactivate).toBe(false);
  });

  it("once-per-bar-close: ignores the forming bar", () => {
    const a = alert([cond("greater")], { trigger: "once-per-bar-close" });
    const b = bars([5, 9, 11]); // last bar (11) is forming, last closed bar is 9
    const r = evaluateAlert(a, { bars: b, interval: "1D", now: (b[2].time + 3600) * 1000 });
    expect(r.fired).toBe(false);
    expect(r.barTime).toBe(b[1].time);
  });

  it("once-per-bar-close: fires for a bar that closed after creation, once", () => {
    const b = bars([5, 11, 3]); // closed bar = 11 at index 1, forming 3
    const now = (b[2].time + 3600) * 1000;
    const a = alert([cond("greater")], { trigger: "once-per-bar-close", createdAt: (b[1].time + 3600) * 1000 });
    const r = evaluateAlert(a, { bars: b, interval: "1D", now });
    expect(r).toMatchObject({ fired: true, price: 11, barTime: b[1].time, deactivate: false });
    // already fired for this closed bar
    expect(evaluateAlert({ ...a, lastFiredAt: now - 1000 }, { bars: b, interval: "1D", now }).fired).toBe(false);
    // alert created after that bar closed: wait for the next close
    expect(evaluateAlert({ ...a, createdAt: (b[2].time + 60) * 1000 }, { bars: b, interval: "1D", now }).fired).toBe(false);
  });

  it("once-per-bar-close: crossings compare closed bars", () => {
    const b = bars([9, 11, 5]); // closed: 9 -> 11 crosses 10; forming bar 5 ignored
    const a = alert([cond("crosses-up")], { trigger: "once-per-bar-close" });
    expect(evaluateAlert(a, { bars: b, interval: "1D", now: (b[2].time + 60) * 1000 }).fired).toBe(true);
  });

  it("once-per-bar-close with no closed bar yet", () => {
    const b = bars([11]);
    const a = alert([cond("greater")], { trigger: "once-per-bar-close" });
    expect(evaluateAlert(a, { bars: b, interval: "1D", now: (b[0].time + 60) * 1000 }).fired).toBe(false);
  });
});

describe("expiry and edge cases", () => {
  it("expired alerts never fire and are deactivated", () => {
    const b = bars([5, 11]);
    const now = (b[1].time + DAY) * 1000;
    const r = evaluateAlert(alert([cond("greater")], { expiresAt: now }), { bars: b, interval: "1D", now });
    expect(r).toMatchObject({ fired: false, expired: true, deactivate: true });
    const ok = evaluateAlert(alert([cond("greater")], { expiresAt: now + 1 }), { bars: b, interval: "1D", now });
    expect(ok).toMatchObject({ fired: true, expired: false });
  });

  it("no bars: nothing fires", () => {
    const r = evaluateAlert(alert([cond("greater")]), { bars: [], interval: "1D", now: Date.now() });
    expect(r.fired).toBe(false);
    expect(r.error).toBe("No bars");
  });

  it("barCloseTime: fixed intervals and calendar months", () => {
    expect(barCloseTime(T0, "1D")).toBe(T0 + DAY);
    expect(barCloseTime(T0, "1h")).toBe(T0 + 3600);
    expect(barCloseTime(T0, "1W")).toBe(T0 + 7 * DAY);
    expect(barCloseTime(Date.UTC(2026, 0, 1) / 1000, "1M")).toBe(Date.UTC(2026, 1, 1) / 1000);
    expect(barCloseTime(Date.UTC(2026, 1, 1) / 1000, "1M")).toBe(Date.UTC(2026, 2, 1) / 1000);
  });
});

// ---------- every alert-capable drawing type ----------

describe("alerts on every drawing type with Add alert", () => {
  const A = (i: number, p: number) => ({ time: T0 + i * DAY, price: p });
  const one = (dr: Drawing) => new Map([[dr.id, dr]]);
  const fire = (op: AlertCondition["op"], dr: Drawing, closes: number[]) => run(alert([cond(op, { kind: "drawing", drawingId: dr.id })]), closes, { drawings: one(dr) }).fired;

  for (const type of ["trendline", "infoline", "trendangle", "arrow"]) {
    it(`${type}: crossing on the drawn segment, not beyond it unless extended`, () => {
      const dr: Drawing = { id: type, type, anchors: [A(0, 10), A(4, 14)] };
      expect(fire("crosses-up", dr, [9, 12])).toBe(true); // line 10 -> 11
      expect(fire("crosses-up", dr, [0, 0, 0, 0, 0, 13, 16])).toBe(false); // bars 5, 6 are past the segment
      expect(fire("crosses-up", { ...dr, props: { extendRight: true } }, [0, 0, 0, 0, 0, 13, 17])).toBe(true); // line 15 -> 16
    });
  }

  it("ray and extended line", () => {
    expect(fire("crosses-down", { id: "r", type: "ray", anchors: [A(0, 10), A(1, 10)] }, [11, 11, 11, 9])).toBe(true);
    expect(fire("crosses-down", { id: "r", type: "ray", anchors: [A(2, 10), A(3, 10)] }, [11, 9])).toBe(false); // left of the ray
    expect(fire("crosses-down", { id: "e", type: "extended", anchors: [A(2, 10), A(3, 10)] }, [11, 9])).toBe(true);
  });

  it("horizontal line and horizontal ray", () => {
    expect(fire("crosses", { id: "h", type: "hline", anchors: [A(5, 10)] }, [9, 11])).toBe(true);
    expect(fire("crosses", { id: "hr", type: "hray", anchors: [A(5, 10)] }, [9, 11])).toBe(false); // before the ray starts
    expect(fire("crosses", { id: "hr", type: "hray", anchors: [A(1, 10)] }, [9, 9, 11])).toBe(true);
  });

  it("vertical line: fires when the bar time reaches the line", () => {
    const v: Drawing = { id: "v", type: "vline", anchors: [A(2, 0)] };
    expect(fire("crosses", v, [1, 1, 1])).toBe(true); // bar 2 at the line
    expect(fire("crosses", v, [1, 1])).toBe(false); // not reached yet
    expect(fire("crosses", v, [1, 1, 1, 1])).toBe(false); // passed on an earlier bar
    expect(fire("greater", v, [1, 1, 1])).toBe(false);
  });

  it("fib retracement: crossing any visible level inside its span (or extended)", () => {
    const fib: Drawing = { id: "f", type: "fib", anchors: [A(0, 100), A(3, 200)] };
    // Levels (legacy 7): 200, 176.4, 161.8, 150, 138.2, 121.4, 100.
    expect(fire("crosses-up", fib, [149, 151])).toBe(true); // 0.5
    expect(fire("crosses-up", fib, [151, 160])).toBe(false); // between levels
    expect(fire("crosses-down", fib, [178, 175])).toBe(true); // 0.236
    // Hidden levels do not count.
    const only618: Drawing = { ...fib, style: { levels: [{ ratio: 0.618, color: "#fff", visible: true }, { ratio: 0.5, color: "#fff", visible: false }] } };
    expect(fire("crosses-up", only618, [149, 151])).toBe(false);
    expect(fire("crosses-up", only618, [130, 140])).toBe(true);
    // Reverse swaps the ends: 0.236 is measured from the start.
    expect(fire("crosses-up", { ...fib, props: { reverse: true } }, [123, 124])).toBe(true); // 123.6
    // Past the drawn span only when extended right.
    expect(fire("crosses-up", fib, [0, 0, 0, 0, 149, 151])).toBe(false);
    expect(fire("crosses-up", { ...fib, props: { extendLines: true } }, [0, 0, 0, 0, 149, 151])).toBe(true);
  });

  it("trend-based fib extension: levels projected from the third anchor", () => {
    const ext: Drawing = { id: "x", type: "fibExtension", anchors: [A(0, 100), A(1, 120), A(2, 110)] };
    // Level 1 = 110 + 20 = 130; level 1.618 = 142.36; drawn from bar 2 for 2 bars.
    expect(fire("crosses-up", ext, [0, 0, 129, 131])).toBe(true);
    expect(fire("crosses-up", ext, [0, 0, 142, 143])).toBe(true);
    expect(fire("crosses-up", ext, [129, 131])).toBe(false); // before the extension starts
  });

  it("parallel channel, flat top/bottom and disjoint channel: entering and exiting their band", () => {
    const chan: Drawing = { id: "c", type: "channel", anchors: [A(0, 10), A(4, 14), A(0, 20)] }; // bands [10,20] -> [14,24]
    expect(fire("enters-channel", chan, [9, 12])).toBe(true);
    expect(fire("exits-channel", chan, [15, 22])).toBe(true); // bar1 band [11,21]
    const flat: Drawing = { id: "fb", type: "flatBottom", anchors: [A(0, 10), A(4, 14), A(2, 5)] }; // [5,10] -> [5,14]
    expect(fire("enters-channel", flat, [4, 6])).toBe(true);
    expect(fire("exits-channel", flat, [6, 12])).toBe(true); // bar1 upper 11
    expect(fire("exits-channel", flat, [6, 10.5])).toBe(false);
    const dis: Drawing = { id: "dc", type: "disjointChannel", anchors: [A(0, 10), A(4, 14), A(0, 30)] }; // upper 30 -> 26, lower 10 -> 14
    expect(fire("exits-channel", dis, [20, 29.5])).toBe(true); // bar1 upper 29
    expect(fire("enters-channel", dis, [31, 28])).toBe(true);
  });

  it("rectangle: band over its time span (extend right opens it to later bars)", () => {
    const r: Drawing = { id: "r", type: "rectangle", anchors: [A(0, 12), A(2, 8)] };
    expect(fire("enters-channel", r, [13, 10])).toBe(true);
    expect(fire("enters-channel", r, [0, 0, 0, 13, 10])).toBe(false);
    expect(fire("enters-channel", { ...r, props: { extendRight: true } }, [0, 0, 0, 13, 10])).toBe(true);
  });
});
