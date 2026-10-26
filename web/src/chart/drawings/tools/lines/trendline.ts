// Trend line: segment between two anchors (catalog LineToolTrendLine).

import { makeLineTool } from "./lineTool";

export const trendline = makeLineTool({
  type: "trendline",
  catalogType: "LineToolTrendLine",
  label: "Trend line",
  menuName: "trendline",
  icon: "trendline",
  hotkey: "Alt+T",
  extendLeft: false,
  extendRight: false,
});
