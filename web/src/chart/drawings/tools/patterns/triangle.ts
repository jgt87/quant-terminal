// Triangle pattern (catalog LineToolTrianglePattern): four points A-B-C-D zig-zagging between two
// converging sides (A→C and B→D); the area between the sides is filled.

import { iconDot, listLabels, patternTool } from "./common";

export const trianglePattern = patternTool({
  type: "trianglePattern",
  catalogType: "LineToolTrianglePattern",
  label: "Triangle pattern",
  anchors: 4,
  color: "#673ab7",
  fill: "backgroundColor",
  shape: "triangle",
  labels: listLabels(["A", "B", "C", "D"]),
  iconPath: "M4.5 5.5L23.5 12.5M4.5 22.5L23.5 15.5M4.5 5.5L9.5 20.5L15.5 8.5L19.5 17.5",
  iconFill: iconDot(4.5, 5.5) + iconDot(19.5, 17.5),
});
