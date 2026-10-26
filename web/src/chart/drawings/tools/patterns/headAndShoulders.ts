// Head and shoulders (catalog LineToolHeadAndShoulders): seven points (base, left shoulder,
// trough, head, trough, right shoulder, base), the neckline through the two troughs and filled
// triangles under the shoulders and the head.

import { iconDot, listLabels, patternTool } from "./common";

export const headAndShoulders = patternTool({
  type: "headAndShoulders",
  catalogType: "LineToolHeadAndShoulders",
  label: "Head and shoulders",
  anchors: 7,
  color: "#089981",
  fill: "transparency",
  shape: "headAndShoulders",
  labels: listLabels(["", "Left Shoulder", "", "Head", "", "Right Shoulder", ""]),
  iconPath: "M3.5 21.5L7.5 12.5L10.5 17.5L14.5 6.5L18.5 17.5L21.5 12.5L24.5 21.5M5.5 17.5H22.5",
  iconFill: iconDot(14.5, 6.5),
});
