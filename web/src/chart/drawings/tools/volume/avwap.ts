// Anchored VWAP (catalog LineToolAnchoredVWAP): one anchor; the volume-weighted average price of
// the bars from the anchor bar to the last bar, with optional ±k·σ bands.
//
// The catalog has no harvested fields, menu or toolbar for this tool (its dialog comes from study
// metadata that was not available). Our defaults: source hlc3, VWAP line #2962ff 2px, three band
// rows (×1 on, ×2 / ×3 off) with a translucent fill between the outermost visible bands.

import { anchoredVwap, distanceToSegment, VWAP_SOURCES, type Drawing, type VwapPoint, type VwapSource } from "@qt/core";
import { font } from "../../../theme";
import { catalogColor } from "../../builders";
import { polyline, prop, strokeWith } from "../../draw";
import type { DrawingToolDef, SettingsField, ToolGeom } from "../../types";

const BANDS = [
  { n: 1, mult: 1, color: "#4caf50", on: true },
  { n: 2, mult: 2, color: "#808000", on: false },
  { n: 3, mult: 3, color: "#00897b", on: false },
];
const FILL = catalogColor("rgba(76, 175, 80, 0.1)");

const SOURCE_LABELS: Record<VwapSource, string> = {
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  hl2: "(H + L)/2",
  hlc3: "(H + L + C)/3",
  ohlc4: "(O + H + L + C)/4",
  hlcc4: "(H + L + C + C)/4",
};

/** Visible bands of a drawing as [band number, multiplier]. */
function bandsOf(d: Drawing): { n: number; mult: number; color: string }[] {
  return BANDS.filter((b) => prop(d, `band${b.n}_visible`, b.on)).map((b) => ({ n: b.n, mult: Number(prop(d, `band${b.n}_multiplier`, b.mult)), color: String(prop(d, `band${b.n}_color`, b.color)) }));
}

export function vwapOf(d: Drawing, g: Pick<ToolGeom, "bars">): { points: VwapPoint[]; bands: { n: number; mult: number; color: string }[] } {
  const a = d.anchors[0];
  const bands = bandsOf(d);
  if (!a) return { points: [], bands };
  return { points: anchoredVwap(g.bars, a.time, prop(d, "source", "hlc3") as VwapSource, bands.map((b) => b.mult)), bands };
}

const withBand = (n: number) => (d: Drawing): Drawing => ({ ...d, props: { ...d.props, [`band${n}_visible`]: true } });

const bandFields: SettingsField[] = BANDS.flatMap((b): SettingsField[] => [
  { kind: "checkbox", key: `props.band${b.n}_visible`, label: `Band #${b.n}`, catalog: `band${b.n}.visible`, default: b.on },
  { kind: "number", key: `props.band${b.n}_multiplier`, label: `Band #${b.n} multiplier`, catalog: `band${b.n}.multiplier`, default: b.mult, min: 0.1, max: 10, step: 0.1, testWith: withBand(b.n) },
]);

const bandStyle: SettingsField[] = BANDS.map((b): SettingsField => ({ kind: "color", key: `props.band${b.n}_color`, label: `Band #${b.n}`, catalog: `band${b.n}.color`, default: b.color, testWith: withBand(b.n) }));

export const anchoredVwapTool: DrawingToolDef = {
  type: "anchoredVwap",
  catalogType: "LineToolAnchoredVWAP",
  family: "projection",
  section: "Volume-based",
  label: "Anchored VWAP",
  icon: "anchoredVwap",
  // Anchor dot with a curve leaving it and a band above and below.
  iconPath: "M5.5 18.5c5-1 8-6 18-7M5.5 13.5c5-1 8-6 18-7M5.5 23.5c5-1 8-6 18-7",
  iconFill: "M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 1,
  // Catalog toolbar unknown: line color + width like other single-line tools.
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  defaults: { color: "#2962ff", width: 2 },
  defaultProps: {
    source: "hlc3",
    ...Object.fromEntries(BANDS.flatMap((b) => [[`band${b.n}_visible`, b.on], [`band${b.n}_multiplier`, b.mult], [`band${b.n}_color`, b.color]])),
    fillBands: true,
    bandsBackground: FILL,
    showLabel: true,
  },
  settings: {
    coordinates: "time",
    inputs: [
      { kind: "select", key: "props.source", label: "Source", catalog: "source", default: "hlc3", options: VWAP_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })) },
      ...bandFields,
    ],
    style: [
      { kind: "color", key: "style.color", label: "VWAP", catalog: "linecolor", default: "#2962ff" },
      { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 2 },
      { kind: "lineStyle", key: "style.lineStyle", label: "Line style", catalog: "linestyle", default: "solid" },
      ...bandStyle,
      { kind: "checkbox", key: "props.fillBands", label: "Background", catalog: "fillBackground", default: true },
      { kind: "color", key: "props.bandsBackground", label: "Background color", catalog: "backgroundColor", default: FILL, alpha: true },
      { kind: "checkbox", key: "props.showLabel", label: "Label", catalog: "showLabel", default: true },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const a = d.anchors[0];
    if (!a) return false;
    const { points } = vwapOf(d, g);
    const px = points.map((p) => g.toPx({ time: p.time, price: p.vwap }));
    if (px.length === 1) return Math.hypot(x - px[0].x, y - px[0].y) <= tol;
    for (let i = 1; i < px.length; i++) if (distanceToSegment(x, y, px[i - 1].x, px[i - 1].y, px[i].x, px[i].y) <= tol) return true;
    const p = g.toPx(a);
    return Math.hypot(x - p.x, y - p.y) <= tol;
  },
  render(c, d) {
    const { ctx } = c;
    const { points, bands } = vwapOf(d, c);
    if (!points.length) return;
    const xy = (t: number, v: number) => c.toPx({ time: t, price: v });
    // Fill between the outermost visible band.
    if (bands.length && prop(d, "fillBands", true)) {
      const k = bands.length - 1;
      ctx.save();
      ctx.fillStyle = String(prop(d, "bandsBackground", FILL));
      ctx.beginPath();
      points.forEach((p, i) => {
        const q = xy(p.time, p.bands[k][1]);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      for (let i = points.length - 1; i >= 0; i--) {
        const q = xy(points[i].time, points[i].bands[k][0]);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    bands.forEach((b, k) => {
      ctx.save();
      strokeWith(ctx, b.color, 1, "solid");
      polyline(ctx, points.map((p) => xy(p.time, p.bands[k][1])));
      polyline(ctx, points.map((p) => xy(p.time, p.bands[k][0])));
      ctx.restore();
    });
    const line = points.map((p) => xy(p.time, p.vwap));
    if (line.length === 1) {
      ctx.beginPath();
      ctx.arc(line[0].x, line[0].y, 2, 0, Math.PI * 2);
      ctx.stroke();
    } else polyline(ctx, line);
    if (prop(d, "showLabel", true)) {
      const last = line[line.length - 1];
      ctx.save();
      ctx.fillStyle = c.color;
      ctx.font = font(c.theme, 11);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`VWAP ${c.formatPrice(points[points.length - 1].vwap)}`, last.x + 6, last.y);
      ctx.restore();
    }
  },
  handles(d, g) {
    const a = d.anchors[0];
    if (!a) return [];
    const first = vwapOf(d, g).points[0];
    return [g.toPx(first ? { time: first.time, price: first.vwap } : a)];
  },
  onAnchorDrag: (d, _i, a) => ({ ...d, anchors: [a] }),
  bounds(d, g) {
    const pts = vwapOf(d, g).points.map((p) => g.toPx({ time: p.time, price: p.vwap }));
    if (!pts.length) {
      const p = g.toPx(d.anchors[0]);
      return { x: p.x, y: p.y, width: 0, height: 0 };
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  },
  stats(d, g) {
    const p = vwapOf(d, g).points;
    return p.length ? [`VWAP ${p[p.length - 1].vwap.toFixed(2)}`, `σ ${p[p.length - 1].stdev.toFixed(2)}`] : [];
  },
};
