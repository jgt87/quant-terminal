// Trend angle (catalog LineToolTrendAngle): a segment with its angle on screen (which follows the
// chart's price/time scale) shown as an arc from the horizontal plus a degree label, and the
// optional line stats.

import { distanceToExtendedSegment, screenAngleDeg, type Point } from "@qt/core";
import { font } from "../../../theme";
import { line, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef } from "../../types";
import { drawLineBody, drawStatsBox, extendRows, lineRows, segmentBounds, statLines, statsRows, type StatKey } from "./lineParts";

const STATS: StatKey[] = ["showPriceRange", "showPercentPriceRange", "showPipsPriceRange", "showBarsRange"];

/** Angle readout at the first anchor: dotted horizontal reference, arc and "n.n°" label. */
function drawAngle(c: DrawCtx, p: Point, q: Point): void {
  const { ctx } = c;
  const deg = screenAngleDeg(p, q);
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const r = Math.max(12, Math.min(48, len * 0.6));
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  line(ctx, p, { x: p.x + r + 12, y: p.y });
  ctx.setLineDash([]);
  ctx.beginPath();
  // Canvas arcs run clockwise on screen; the readout counts counter-clockwise from +x.
  const end = (-deg * Math.PI) / 180;
  ctx.arc(p.x, p.y, r, Math.min(0, end), Math.max(0, end));
  ctx.stroke();
  ctx.fillStyle = c.color;
  ctx.font = font(c.theme, 12, 500);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const mid = end / 2;
  ctx.fillText(`${deg.toFixed(1)}°`, p.x + (r + 8) * Math.cos(mid) + 4, p.y + (r + 8) * Math.sin(mid));
  ctx.restore();
}

export const trendangle: DrawingToolDef = {
  type: "trendangle",
  catalogType: "LineToolTrendAngle",
  family: "lines",
  label: "Trend angle",
  icon: "trendangle",
  // Rising line from an anchor, horizontal reference and the angle arc.
  iconPath: "M5.5 21.5L22.5 6.5M5.5 21.5h17M14.5 21.5a9 9 0 0 0-2.25-5.96",
  iconFill: "M5.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  alert: "line",
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"],
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff" },
  defaultProps: {
    extendLeft: false,
    extendRight: false,
    showMiddlePoint: false,
    showPriceLabels: false,
    ...Object.fromEntries(STATS.map((k) => [k, false])),
    statsPosition: 2,
    alwaysShowStats: false,
  },
  settings: {
    coordinates: "time-price",
    style: [
      ...lineRows("#2962ff"),
      ...extendRows(false),
      { kind: "checkbox", key: "props.showMiddlePoint", label: "Middle point", catalog: "showMiddlePoint", default: false },
      { kind: "checkbox", key: "props.showPriceLabels", label: "Price labels", catalog: "showPriceLabels", default: false },
      ...statsRows(STATS, false, 2, false),
    ],
  },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return distanceToExtendedSegment(x, y, g.toPx(a), g.toPx(b), prop(d, "extendLeft", false), prop(d, "extendRight", false)) <= tol;
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const p = c.toPx(a);
    const q = c.toPx(b);
    drawLineBody(c, d, a, b, p, q);
    drawAngle(c, p, q);
    if (c.selected || c.hovered || prop(d, "alwaysShowStats", false)) drawStatsBox(c, d, p, q, statLines(d, c, c.priceDecimals, false), 2);
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  bounds: segmentBounds,
  stats(d, g) {
    const [a, b] = d.anchors;
    if (!a || !b) return [];
    return [`${screenAngleDeg(g.toPx(a), g.toPx(b)).toFixed(1)}°`, ...statLines(d, g, 2, false)];
  },
};
