// Bars pattern (catalog LineToolBarsPattern): copies the shape of the bars between the two anchors
// and draws the copy between the anchors, as HL bars, OC bars or a line of one price. Mirrored
// (reversed in time) and Flipped (upside down) are style options and context-menu toggles.
//
// The copied bars are kept in props.pattern (open/high/low/close relative to the first anchor's
// price) so the copy keeps its shape when it is moved away from the source bars. They are captured
// once, when the drawing is created (onCreate). Drawings without a stored copy (old layouts, or no
// bars under the anchors at creation) show the bars currently under their anchors.

import { capturePattern, forecastInBox, patternLineValue, transformPattern, type Bar, type Drawing, type PatternBar } from "@qt/core";
import { anchorHandles, line, polyline, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";

const MODES: { value: number; label: string }[] = [
  { value: 0, label: "HL bars" },
  { value: 2, label: "OC bars" },
  { value: 1, label: "Line - close" },
  { value: 3, label: "Line - open" },
  { value: 4, label: "Line - high" },
  { value: 5, label: "Line - low" },
  { value: 6, label: "Line - HL/2" },
];

/** Stored copy, else the bars under the anchors (never written back: rendering is pure). */
export function patternOf(d: Drawing, bars: readonly Bar[]): PatternBar[] {
  const stored = d.props?.pattern;
  if (Array.isArray(stored) && stored.length) return stored as PatternBar[];
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  return capturePattern(bars, a.time, b.time, a.price);
}

/** Creation: copies the bars between the anchors into props.pattern (once). */
export function capturedPattern(d: Drawing, bars: readonly Bar[]): Drawing {
  const [a, b] = d.anchors;
  if (!a || !b) return d;
  const p = capturePattern(bars, a.time, b.time, a.price);
  return p.length ? { ...d, props: { ...(d.props ?? {}), pattern: p } } : d;
}

/** Copy after Mirrored / Flipped, in absolute prices, with each bar's x. */
function copyOf(d: Drawing, g: ToolGeom): { x: number; bar: PatternBar }[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const p = transformPattern(patternOf(d, g.bars), { mirrored: prop(d, "mirrored", false), flipped: prop(d, "flipped", false) });
  const x0 = g.toPx(a).x;
  const x1 = g.toPx(b).x;
  const n = p.length;
  return p.map((bar, i) => ({
    x: n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : x0,
    bar: bar.map((v) => v + a.price) as PatternBar,
  }));
}

const toggle = (key: "mirrored" | "flipped") => (d: Drawing): Drawing => ({ ...d, props: { ...d.props, [key]: !prop(d, key, false) } });

export const barsPattern: DrawingToolDef = {
  type: "barsPattern",
  catalogType: "LineToolBarsPattern",
  family: "projection",
  section: "Forecasting",
  label: "Bars pattern",
  icon: "barsPattern",
  // Three HL bars with open/close ticks.
  iconPath: "M7.5 8.5v13M5.5 11.5h2M7.5 18.5h2M14.5 5.5v14M12.5 15.5h2M14.5 8.5h2M21.5 10.5v13M19.5 13.5h2M21.5 20.5h2",
  anchors: 2,
  floatingToolbar: ["templates", "background-color", "settings", "lock", "remove", "more"],
  floatBindings: { "background-color": "style.color" },
  defaults: { color: "#2962ff" },
  defaultProps: { mode: 0, mirrored: false, flipped: false },
  settings: {
    coordinates: false,
    style: [
      { kind: "color", key: "style.color", label: "Color", catalog: "color", default: "#2962ff" },
      { kind: "select", key: "props.mode", label: "Mode", catalog: "mode", default: 0, options: MODES },
      { kind: "checkbox", key: "props.mirrored", label: "Mirrored", catalog: "mirrored", default: false },
      { kind: "checkbox", key: "props.flipped", label: "Flipped", catalog: "flipped", default: false },
    ],
  },
  menuSection: (d, ctx) => [
    { id: "barsPattern-mirrored", label: "Mirrored", checked: prop(d, "mirrored", false), onSelect: () => ctx.update(toggle("mirrored")) },
    { id: "barsPattern-flipped", label: "Flipped", checked: prop(d, "flipped", false), onSelect: () => ctx.update(toggle("flipped")) },
  ],
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    const copy = copyOf(d, g);
    const pa = g.toPx(a);
    const pb = g.toPx(b);
    if (!copy.length) return forecastInBox(x, y, pa, pb, tol);
    const hi = Math.max(...copy.map((c) => c.bar[1]));
    const lo = Math.min(...copy.map((c) => c.bar[2]));
    return forecastInBox(x, y, { x: pa.x, y: g.toPx({ time: a.time, price: hi }).y }, { x: pb.x, y: g.toPx({ time: a.time, price: lo }).y }, tol);
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const copy = copyOf(d, c);
    const y = (v: number) => c.toPx({ time: a.time, price: v }).y;
    if (!copy.length) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      line(ctx, c.toPx(a), c.toPx(b));
      ctx.restore();
      return;
    }
    const mode = Number(prop(d, "mode", 0));
    if (mode === 0 || mode === 2) {
      const w = copy.length > 1 ? Math.max(1, Math.abs(copy[1].x - copy[0].x) * 0.35) : 3;
      for (const { x, bar } of copy) {
        const [o, h, l, cl] = bar;
        if (mode === 0) {
          line(ctx, { x, y: y(h) }, { x, y: y(l) });
          line(ctx, { x: x - w, y: y(o) }, { x, y: y(o) });
          line(ctx, { x, y: y(cl) }, { x: x + w, y: y(cl) });
        } else {
          line(ctx, { x, y: y(o) }, { x, y: y(cl) });
          line(ctx, { x: x - w, y: y(o) }, { x: x + w, y: y(o) });
        }
      }
      return;
    }
    polyline(ctx, copy.map(({ x, bar }) => ({ x, y: y(patternLineValue(bar, mode)) })));
  },
  onCreate: (d, g) => capturedPattern(d, g.bars),
  handles: anchorHandles,
  stats: (d, g: ToolGeom) => [`${patternOf(d, g.bars).length} bars`],
};
