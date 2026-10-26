// Forecast (catalog LineToolPrediction, "Position forecast"): a line from the source anchor to the
// target anchor with price labels. Once a bar at or after the target time exists, the target label
// gains the outcome (success when price reached the target in the forecast direction, else failure)
// and the actual change from the source price to the end bar's close.
//
// props.status (catalog factory key, 0 = pending, 1 = success, 2 = failure) is only used when the
// bars cannot decide the outcome (no data yet); the computed outcome always wins.

import { distanceToSegment, predictionOutcome, type Drawing, type PredictionOutcome } from "@qt/core";
import { formatPrice, formatSigned } from "../../../format";
import { anchorHandles, line, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom } from "../../types";
import { fmtNum, labelBox, withTransparency } from "./common";

const BLUE = "#2962ff";
/** Source background: catalog #2962FF at transparency 10. */
const SOURCE_BG = "#2962ffe6";

/** Outcome from the bars, or the stored status when the bars cannot decide yet. */
export function forecastOutcome(d: Drawing, g: Pick<ToolGeom, "bars">): PredictionOutcome {
  const [a, b] = d.anchors;
  const o = predictionOutcome(a, b, g.bars);
  if (o.status !== "pending") return o;
  const s = Number(prop(d, "status", 0));
  return s === 1 || s === 2 ? { ...o, status: s === 1 ? "success" : "failure" } : o;
}

/** Wiring test state: anchors beyond the data and a stored outcome. */
const withStatus = (status: number) => (d: Drawing): Drawing => ({
  ...d,
  anchors: d.anchors.map((x) => ({ ...x, time: x.time + 1e9 })),
  props: { ...d.props, status },
});

const color = (key: string, label: string, def: string, catalog = key, extra: Partial<SettingsField> = {}): SettingsField =>
  ({ kind: "color", key: `props.${key}`, label, catalog, default: def, ...extra }) as SettingsField;

function labelsOf(d: Drawing, c: DrawCtx) {
  const [a, b] = d.anchors;
  const fp = (v: number) => formatPrice(v, c.priceDecimals);
  const o = forecastOutcome(d, c);
  const change = b.price - a.price;
  const pct = a.price !== 0 ? (change / Math.abs(a.price)) * 100 : 0;
  return { o, source: [fp(a.price)], target: [fp(b.price), `${formatSigned(change, c.priceDecimals)} (${fmtNum(pct)}%)`] };
}

export const prediction: DrawingToolDef = {
  type: "prediction",
  catalogType: "LineToolPrediction",
  family: "projection",
  section: "Forecasting",
  label: "Position forecast",
  menuName: "forecast",
  icon: "prediction",
  // Source and target boxes joined by the forecast line.
  iconPath: "M4.5 18.5h6v5h-6zM17.5 4.5h6v5h-6zM10.5 18.5l7-9",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  defaults: { color: BLUE, width: 2 },
  defaultProps: {
    status: 0,
    transparency: 10,
    centersColor: "#202020",
    sourceBackColor: SOURCE_BG,
    sourceStrokeColor: BLUE,
    sourceTextColor: "#ffffff",
    targetBackColor: BLUE,
    targetStrokeColor: BLUE,
    targetTextColor: "#ffffff",
    successBackground: "#4caf50",
    successTextColor: "#ffffff",
    failureBackground: "#f23645",
    failureTextColor: "#ffffff",
    intermediateBackColor: "#ead289",
    intermediateTextColor: "#6d4d22",
  },
  settings: {
    coordinates: "time-price",
    style: [
      { kind: "width", key: "style.width", label: "Line width", catalog: "linewidth", default: 2 },
      { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: BLUE },
      color("sourceTextColor", "Source text", "#ffffff"),
      // Catalog key "transparency" names the source background row (color + its transparency).
      color("sourceBackColor", "Source background", SOURCE_BG, "transparency", { alpha: true }),
      color("sourceStrokeColor", "Source border", BLUE),
      color("targetTextColor", "Target text", "#ffffff"),
      color("targetBackColor", "Target background", BLUE),
      color("targetStrokeColor", "Target border", BLUE),
      color("successTextColor", "Success text", "#ffffff", "successTextColor", { testWith: withStatus(1) }),
      color("successBackground", "Success background", "#4caf50", "successBackground", { testWith: withStatus(1) }),
      color("failureTextColor", "Failure text", "#ffffff", "failureTextColor", { testWith: withStatus(2) }),
      color("failureBackground", "Failure background", "#f23645", "failureBackground", { testWith: withStatus(2) }),
    ],
  },
  contextMenu: (_d, ctx) => ctx.generic({ omit: ["clone"] }),
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    const p = g.toPx(a);
    const q = g.toPx(b);
    return distanceToSegment(x, y, p.x, p.y, q.x, q.y) <= tol || Math.hypot(x - q.x, y - q.y) <= 16 + tol || Math.hypot(x - p.x, y - p.y) <= 12 + tol;
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a) return;
    const { ctx } = c;
    const p = c.toPx(a);
    if (!b) return;
    const q = c.toPx(b);
    line(ctx, p, q);
    // Anchor centers.
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = String(prop(d, "centersColor", "#202020"));
    for (const pt of [p, q]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    const L = labelsOf(d, c);
    const size = 12;
    const up = b.price >= a.price;
    labelBox(c, L.source, p.x, p.y + (up ? 16 : -16), {
      color: String(prop(d, "sourceTextColor", "#ffffff")),
      size,
      background: withTransparency(String(prop(d, "sourceBackColor", SOURCE_BG)), Number(prop(d, "transparency", 10))),
      border: String(prop(d, "sourceStrokeColor", BLUE)),
    });
    const tBox = labelBox(c, L.target, q.x, q.y + (up ? -24 : 24), {
      color: String(prop(d, "targetTextColor", "#ffffff")),
      size,
      background: String(prop(d, "targetBackColor", BLUE)),
      border: String(prop(d, "targetStrokeColor", BLUE)),
    });
    if (L.o.status === "pending" || !tBox) return;
    const ok = L.o.status === "success";
    const res = [ok ? "Success" : "Failure", `${formatSigned(L.o.change, c.priceDecimals)} (${fmtNum(L.o.percent)}%)`];
    const y = up ? tBox.y - 8 - 2 * Math.round(size * 1.3) / 2 - 6 : tBox.y + tBox.height + 8 + Math.round(size * 1.3) + 6;
    labelBox(c, res, q.x, y, {
      color: String(prop(d, ok ? "successTextColor" : "failureTextColor", "#ffffff")),
      size,
      background: String(prop(d, ok ? "successBackground" : "failureBackground", ok ? "#4caf50" : "#f23645")),
    });
  },
  handles: anchorHandles,
  stats(d, g) {
    const [a, b] = d.anchors;
    if (!a || !b) return [];
    const o = forecastOutcome(d, g);
    return [o.status === "pending" ? "Pending" : `${o.status === "success" ? "Success" : "Failure"} ${fmtNum(o.percent)}%`];
  },
};
