// XABCD pattern (catalog LineTool5PointsPattern): five points X-A-B-C-D, filled triangles XAB and
// BCD, ratio connectors XB (AB/XA), AC (BC/AB), BD (CD/BC) and XD (AD/XA).

import { iconDot, listLabels, patternTool } from "./common";

export const xabcdPattern = patternTool({
  type: "xabcdPattern",
  catalogType: "LineTool5PointsPattern",
  label: "XABCD pattern",
  anchors: 5,
  color: "#2962FF",
  fill: "transparency",
  shape: "xabcd",
  ratios: "xabcd",
  labels: listLabels(["X", "A", "B", "C", "D"]),
  iconPath: "M4.5 19.5L9.5 7.5L13.5 15.5L18.5 9.5L23.5 20.5M4.5 19.5L13.5 15.5L23.5 20.5",
  iconFill: iconDot(4.5, 19.5) + iconDot(23.5, 20.5),
});
