// ABCD pattern (catalog LineToolABCD): four points A-B-C-D with ratio connectors AC (BC/AB) and
// BD (CD/BC); AB=CD symmetry shows as the BD ratio together with the leg lengths.

import { iconDot, listLabels, patternTool } from "./common";

export const abcdPattern = patternTool({
  type: "abcdPattern",
  catalogType: "LineToolABCD",
  label: "ABCD pattern",
  anchors: 4,
  color: "#089981",
  shape: "none",
  ratios: "abcd",
  labels: listLabels(["A", "B", "C", "D"]),
  iconPath: "M5.5 21.5L11.5 8.5L16.5 15.5L22.5 5.5",
  iconFill: iconDot(5.5, 21.5) + iconDot(22.5, 5.5),
});
