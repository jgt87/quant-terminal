// Ghost feed (catalog LineToolGhostFeed): hypothetical candles along a clicked path (poly creation:
// click points, double-click / Enter finishes). One candle per bar slot between consecutive points,
// each opening at the previous close; wick length follows the variance (% of the body).
//
// The catalog lists no settings fields for this tool (dialog not observed) but gives the factory
// defaults: variance 50, transparency 50 and the candle style. Those become our Style tab.

import { distanceToSegment, ghostCandles, type Drawing, type GhostCandle } from "@qt/core";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef, SettingsField, ToolGeom } from "../../types";
import { withTransparency } from "./common";

const CANDLE = {
  drawWick: true,
  drawBorder: true,
  upColor: "#ace5dc",
  downColor: "#faa1a4",
  borderColor: "#378658",
  borderUpColor: "#089981",
  borderDownColor: "#f23645",
  wickColor: "#808080",
};
const ck = (k: keyof typeof CANDLE) => `candleStyle_${k}`;

export function ghostOf(d: Drawing, g: Pick<ToolGeom, "intervalSec">): GhostCandle[] {
  return ghostCandles(d.points ?? [], g.intervalSec, Number(prop(d, "variance", 50)));
}

const col = (k: keyof typeof CANDLE, label: string, extra: Partial<SettingsField> = {}): SettingsField =>
  ({ kind: "color", key: `props.${ck(k)}`, label, catalog: `candleStyle.${k}`, default: CANDLE[k], ...extra }) as SettingsField;

export const ghostFeed: DrawingToolDef = {
  type: "ghostFeed",
  catalogType: "LineToolGhostFeed",
  family: "projection",
  section: "Forecasting",
  label: "Ghost feed",
  icon: "ghostFeed",
  // Rising candles along a dotted path.
  iconPath: "M6.5 15.5v6M5 17.5h3v3H5zM13.5 10.5v7M12 12.5h3v3h-3zM20.5 4.5v8M19 6.5h3v4h-3z",
  anchors: "poly",
  floatingToolbar: ["templates", "settings", "lock", "remove", "more"],
  defaults: {},
  defaultProps: {
    variance: 50,
    transparency: 50,
    ...Object.fromEntries(Object.entries(CANDLE).map(([k, v]) => [ck(k as keyof typeof CANDLE), v])),
  },
  settings: {
    coordinates: "time-price",
    style: [
      col("upColor", "Up candles"),
      col("downColor", "Down candles"),
      { kind: "checkbox", key: `props.${ck("drawBorder")}`, label: "Borders", catalog: "candleStyle.drawBorder", default: true },
      col("borderUpColor", "Up border", { showIf: (d) => prop(d, ck("drawBorder"), true) }),
      col("borderDownColor", "Down border", { showIf: (d) => prop(d, ck("drawBorder"), true) }),
      col("borderColor", "Border", { visual: false }),
      { kind: "checkbox", key: `props.${ck("drawWick")}`, label: "Wicks", catalog: "candleStyle.drawWick", default: true },
      col("wickColor", "Wick", { showIf: (d) => prop(d, ck("drawWick"), true) }),
      { kind: "number", key: "props.transparency", label: "Transparency", catalog: "transparency", default: 50, min: 0, max: 100, step: 1 },
      { kind: "number", key: "props.variance", label: "Variance", catalog: "variance", default: 50, min: 0, max: 100, step: 1 },
    ],
  },
  // Catalog menu: no Settings… item.
  contextMenu: (_d, ctx) => ctx.generic({ omit: ["settings"] }),
  hitTest(d, g, x, y, tol) {
    const pts = (d.points ?? []).map((p) => g.toPx(p));
    for (let i = 1; i < pts.length; i++) if (distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
    for (const k of ghostOf(d, g)) {
      const p = g.toPx({ time: k.time, price: k.high });
      const q = g.toPx({ time: k.time, price: k.low });
      if (Math.abs(x - p.x) <= tol + 3 && y >= p.y - tol && y <= q.y + tol) return true;
    }
    return false;
  },
  render(c, d) {
    const { ctx } = c;
    const candles = ghostOf(d, c);
    if (!candles.length) return;
    const tr = Number(prop(d, "transparency", 50));
    const xs = candles.map((k) => c.toPx({ time: k.time, price: k.close }).x);
    const w = Math.max(1, (xs.length > 1 ? Math.abs(xs[1] - xs[0]) : 6) * 0.6);
    const border = prop(d, ck("drawBorder"), true);
    const wick = prop(d, ck("drawWick"), true);
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    candles.forEach((k, i) => {
      const up = k.close >= k.open;
      const x = xs[i];
      const y = (v: number) => c.toPx({ time: k.time, price: v }).y;
      if (wick) {
        ctx.strokeStyle = withTransparency(String(prop(d, ck("wickColor"), CANDLE.wickColor)), tr);
        ctx.beginPath();
        ctx.moveTo(x, y(k.high));
        ctx.lineTo(x, y(k.low));
        ctx.stroke();
      }
      const top = y(Math.max(k.open, k.close));
      const h = Math.max(1, y(Math.min(k.open, k.close)) - top);
      ctx.fillStyle = withTransparency(String(prop(d, ck(up ? "upColor" : "downColor"), up ? CANDLE.upColor : CANDLE.downColor)), tr);
      ctx.fillRect(x - w / 2, top, w, h);
      if (border) {
        ctx.strokeStyle = withTransparency(String(prop(d, ck(up ? "borderUpColor" : "borderDownColor"), up ? CANDLE.borderUpColor : CANDLE.borderDownColor)), tr);
        ctx.strokeRect(x - w / 2 + 0.5, top + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      }
    });
    ctx.restore();
  },
  handles: anchorHandles,
  stats: (d, g) => [`${ghostOf(d, g).length} candles`],
};
