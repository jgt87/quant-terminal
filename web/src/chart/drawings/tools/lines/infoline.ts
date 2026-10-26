// Info line (catalog LineToolInfoLine): a segment between two anchors with a stats readout
// (price change, percent, pips, bars, date/time range, distance, angle), text and line ends.

import { distanceToExtendedSegment } from "@qt/core";
import { prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { drawLineBody, drawSegmentText, drawStatsBox, extendRows, lineRows, lineTextRows, segmentBounds, statLines, statsRows, type StatKey } from "./lineParts";

const STATS: StatKey[] = ["showPriceRange", "showPercentPriceRange", "showPipsPriceRange", "showBarsRange", "showDateTimeRange", "showDistance", "showAngle"];

export const infoline: DrawingToolDef = {
  type: "infoline",
  catalogType: "LineToolInfoLine",
  family: "lines",
  label: "Info line",
  icon: "infoline",
  // Segment with anchor dots and a small readout box above it.
  iconPath: "M5.5 22.5L22.5 13.5M13.5 4.5h10v6h-10zM15.5 7.5h6",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 16a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  alert: "line",
  floatingToolbar: ["templates", "line-tool-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"],
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff", textColor: "#2962ff", textSize: 14, bold: false, italic: false },
  defaultProps: {
    extendLeft: false,
    leftEnd: 0,
    extendRight: false,
    rightEnd: 0,
    showMiddlePoint: false,
    showPriceLabels: false,
    ...Object.fromEntries(STATS.map((k) => [k, true])),
    statsPosition: 1,
    alwaysShowStats: true,
    vertLabelsAlign: "bottom",
    horzLabelsAlign: "center",
  },
  settings: {
    coordinates: "time-price",
    style: [
      ...lineRows("#2962ff"),
      ...extendRows(true),
      { kind: "checkbox", key: "props.showMiddlePoint", label: "Middle point", catalog: "showMiddlePoint", default: false },
      { kind: "checkbox", key: "props.showPriceLabels", label: "Price labels", catalog: "showPriceLabels", default: false },
      ...statsRows(STATS, true, 1, true),
    ],
    text: lineTextRows("#2962ff", 14),
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
    if (c.selected || c.hovered || prop(d, "alwaysShowStats", true)) drawStatsBox(c, d, p, q, statLines(d, c, c.priceDecimals, true), 1);
    drawSegmentText(c, d, p, q, 14);
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  bounds: segmentBounds,
  stats: (d, g) => statLines(d, g, 2, true),
};
