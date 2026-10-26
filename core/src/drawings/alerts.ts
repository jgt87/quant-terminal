// Drawing alerts: which drawing types offer "Add alert on …" and the value of each at a bar time.
// One list for the web tools (DrawingToolDef.alert), the alert dialog (operators, channel types)
// and the server evaluator (server/src/alerts/evaluate.ts), so all three agree. Values follow the
// drawn geometry: a line exists where it is drawn (the segment between its anchors plus the sides
// its extend flags open), bands give their two bounds, Fibonacci tools give their visible levels
// and the vertical line gives its time (a time-cross event).

import type { Anchor, Drawing } from "../types";
import type { AlertOperator } from "../types-ext";
import { disjointLines, flatLines, priceAtTime } from "./channels";
import { fibExtensionLevels } from "./fibonacci";
import { channelLines, FIB_RATIOS } from "./geometry";

/** "line": crossing alerts; "band": entering / exiting (and crossing either bound). */
export type DrawingAlertKind = "line" | "band";

/** What the evaluator gets from a drawing: one price, several levels, a time, or a band. */
export type DrawingAlertShape = "line" | "levels" | "time" | "band";

export interface DrawingAlertSpec {
  kind: DrawingAlertKind;
  shape: DrawingAlertShape;
  /** Factory extend flags (props.extendLeft / props.extendRight) of line-shaped tools. */
  extend?: readonly [boolean, boolean];
}

/**
 * Drawing types with "Add alert on …" (the catalog's contextMenuHasAddAlert), keyed by
 * Drawing.type. Every registered tool's `alert` must equal `kind` here (web test).
 */
export const DRAWING_ALERTS: Readonly<Record<string, DrawingAlertSpec>> = {
  trendline: { kind: "line", shape: "line", extend: [false, false] },
  ray: { kind: "line", shape: "line", extend: [false, true] },
  extended: { kind: "line", shape: "line", extend: [true, true] },
  infoline: { kind: "line", shape: "line", extend: [false, false] },
  trendangle: { kind: "line", shape: "line", extend: [false, false] },
  arrow: { kind: "line", shape: "line", extend: [false, false] },
  hline: { kind: "line", shape: "line" },
  hray: { kind: "line", shape: "line" },
  vline: { kind: "line", shape: "time" },
  fib: { kind: "line", shape: "levels" },
  fibExtension: { kind: "line", shape: "levels" },
  channel: { kind: "band", shape: "band" },
  flatBottom: { kind: "band", shape: "band" },
  disjointChannel: { kind: "band", shape: "band" },
  rectangle: { kind: "band", shape: "band" },
};

/** Alert kind of a drawing type (undefined: no "Add alert"). */
export function drawingAlertKind(type: string): DrawingAlertKind | undefined {
  return DRAWING_ALERTS[type]?.kind;
}

/** Drawing types whose alerts are channel (band) alerts. */
export const ALERT_BAND_TYPES: readonly string[] = Object.keys(DRAWING_ALERTS).filter((t) => DRAWING_ALERTS[t].kind === "band");

/** Operators that make sense against a drawing of each shape (the first one is the default). */
export const ALERT_OPERATORS_BY_SHAPE: Readonly<Record<DrawingAlertShape, readonly AlertOperator[]>> = {
  line: ["crosses", "crosses-up", "crosses-down", "greater", "less"],
  levels: ["crosses", "crosses-up", "crosses-down"],
  time: ["crosses"],
  band: ["enters-channel", "exits-channel", "crosses", "crosses-up", "crosses-down"],
};

/** Operators offered for a drawing type (every operator for unknown types). */
export function alertOperatorsFor(type: string | undefined): readonly AlertOperator[] | null {
  const spec = type ? DRAWING_ALERTS[type] : undefined;
  return spec ? ALERT_OPERATORS_BY_SHAPE[spec.shape] : null;
}

/** Default operator of an alert on a drawing type. */
export function defaultAlertOperator(type: string | undefined): AlertOperator {
  return alertOperatorsFor(type)?.[0] ?? "crosses";
}

/** Value of a drawing at a time: a price, a band, price levels, or a vertical line's time. */
export type DrawingAlertValue = number | { lo: number; hi: number } | { levels: number[] } | { time: number; at: number } | null;

const flag = (d: Drawing, key: string, def: boolean): boolean => {
  const v = d.props?.[key];
  return typeof v === "boolean" ? v : def;
};

/**
 * Whether time `t` lies on the drawn part of the line a→b: the segment between the anchors, plus
 * the side beyond `a` when `extendLeft` and beyond `b` when `extendRight` (the flags extend past
 * the first / second anchor, as the line is drawn). A vertical line (a.time = b.time) has no price.
 */
export function lineCoversTime(a: Anchor, b: Anchor, t: number, extendLeft: boolean, extendRight: boolean): boolean {
  if (a.time === b.time) return false;
  if (t >= Math.min(a.time, b.time) && t <= Math.max(a.time, b.time)) return true;
  const forward = a.time < b.time;
  const beyondA = forward ? t < a.time : t > a.time;
  return beyondA ? extendLeft : extendRight;
}

/** Price of the drawn line a→b at `t`, or null where it is not drawn. */
export function linePriceAt(a: Anchor, b: Anchor, t: number, extendLeft: boolean, extendRight: boolean): number | null {
  return lineCoversTime(a, b, t, extendLeft, extendRight) ? priceAtTime(a, b, t) : null;
}

/** Whether `t` lies in [t0, t1] (either order), opened to earlier / later times by the flags. */
function spanCovers(t0: number, t1: number, t: number, earlier: boolean, later: boolean): boolean {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return (t >= lo || earlier) && (t <= hi || later);
}

/** Factory visible coefficients of the trend-based fib extension (drawings without own levels). */
export const FIB_EXTENSION_DEFAULT_COEFFS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236];

const visibleRatios = (d: Drawing, fallback: readonly number[]): number[] => {
  const own = d.style?.levels;
  return own?.length ? own.filter((l) => l.visible !== false).map((l) => l.ratio) : [...fallback];
};

/** Fib retracement level prices (reverse swaps the ends; log scale interpolates in log space). */
export function fibRetracementPrices(d: Drawing): number[] {
  let [a, b] = d.anchors;
  if (!a || !b) return [];
  if (d.props?.reverse === true) [a, b] = [b, a];
  const ratios = visibleRatios(d, FIB_RATIOS);
  if (d.props?.fibLevelsBasedOnLogScale === true && a.price > 0 && b.price > 0) {
    const la = Math.log(a.price);
    const lb = Math.log(b.price);
    return ratios.map((r) => Math.exp(lb + (la - lb) * r));
  }
  return ratios.map((r) => b.price + (a.price - b.price) * r);
}

/** Trend-based fib extension level prices. */
export function fibExtensionPrices(d: Drawing): number[] {
  const [a, b, c] = d.anchors;
  if (!a || !b || !c) return [];
  return fibExtensionLevels(a, b, c, visibleRatios(d, FIB_EXTENSION_DEFAULT_COEFFS), { reverse: d.props?.reverse === true, log: d.props?.fibLevelsBasedOnLogScale === true }).map((l) => l.price);
}

function band(p: number | null, q: number | null): { lo: number; hi: number } | null {
  return p === null || q === null ? null : { lo: Math.min(p, q), hi: Math.max(p, q) };
}

/**
 * Value of a drawing at bar time `t` (seconds) for alert evaluation, or null where the drawing
 * has no value (outside its drawn span, incomplete, or not alert-capable).
 */
export function drawingAlertValue(d: Drawing, t: number): DrawingAlertValue {
  const spec = DRAWING_ALERTS[d.type];
  if (!spec) return null;
  const [a, b, c] = d.anchors;
  if (!a) return null;
  const extL = flag(d, "extendLeft", spec.extend?.[0] ?? false);
  const extR = flag(d, "extendRight", spec.extend?.[1] ?? false);
  switch (d.type) {
    case "hline":
      return a.price;
    case "hray":
      return t >= a.time ? a.price : null;
    case "vline":
      return { time: a.time, at: t };
    case "trendline":
    case "ray":
    case "extended":
    case "infoline":
    case "trendangle":
    case "arrow":
      return b ? linePriceAt(a, b, t, extL, extR) : null;
    case "fib": {
      if (!b || d.style?.fibLevels === false) return null;
      if (!spanCovers(a.time, b.time, t, flag(d, "extendLinesLeft", false), flag(d, "extendLines", false))) return null;
      const levels = fibRetracementPrices(d);
      return levels.length ? { levels } : null;
    }
    case "fibExtension": {
      if (!b || !c) return null;
      const span = Math.abs(c.time - a.time);
      if (!spanCovers(c.time, c.time + span, t, flag(d, "extendLinesLeft", false), flag(d, "extendLines", false))) return null;
      const levels = fibExtensionPrices(d);
      return levels.length ? { levels } : null;
    }
    case "rectangle":
      if (!b || !spanCovers(a.time, b.time, t, extL, extR)) return null;
      return { lo: Math.min(a.price, b.price), hi: Math.max(a.price, b.price) };
    case "channel":
    case "flatBottom":
    case "disjointChannel": {
      if (!b || !c) return null;
      const [l1, l2] = d.type === "channel" ? channelLines(a, b, c) : d.type === "flatBottom" ? flatLines(a, b, c) : disjointLines(a, b, c);
      return band(linePriceAt(l1[0], l1[1], t, extL, extR), linePriceAt(l2[0], l2[1], t, extL, extR));
    }
    default:
      return null;
  }
}
