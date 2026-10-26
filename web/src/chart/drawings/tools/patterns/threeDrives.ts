// Three drives pattern (catalog LineToolThreeDrivers): seven points (start, drive 1, retracement,
// drive 2, retracement, drive 3, end) with ratio connectors between every second point
// (retracement and extension of each leg against the previous one).

import { iconDot, listLabels, patternTool } from "./common";

export const threeDrives = patternTool({
  type: "threeDrives",
  catalogType: "LineToolThreeDrivers",
  label: "Three drives pattern",
  anchors: 7,
  color: "#673ab7",
  shape: "none",
  ratios: "threeDrives",
  labels: listLabels(["", "Drive 1", "", "Drive 2", "", "Drive 3", ""]),
  iconPath: "M3.5 23.5L7.5 16.5L10.5 19.5L14.5 11.5L17.5 14.5L21.5 4.5L24.5 8.5",
  iconFill: iconDot(21.5, 4.5),
});
