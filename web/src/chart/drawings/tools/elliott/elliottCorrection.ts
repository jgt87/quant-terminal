// Elliott correction wave (A·B·C) (LineToolElliottCorrection): origin 0 and waves A-B-C, letters by degree.

import { elliottTool } from "./wave";

export const elliottCorrection = elliottTool({
  type: "elliottCorrection",
  catalogType: "LineToolElliottCorrection",
  label: "Elliott correction wave (A·B·C)",
  kind: "correction",
  anchors: 4,
  color: "#3d85c6",
  iconPath: "M4.5 5.5L11.5 18.5L16.5 10.5L23.5 22.5",
});
