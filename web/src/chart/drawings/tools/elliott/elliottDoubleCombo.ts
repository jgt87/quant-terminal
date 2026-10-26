// Elliott double combo wave (W·X·Y) (LineToolElliottDoubleCombo): origin 0 and waves W-X-Y.

import { elliottTool } from "./wave";

export const elliottDoubleCombo = elliottTool({
  type: "elliottDoubleCombo",
  catalogType: "LineToolElliottDoubleCombo",
  label: "Elliott double combo wave (W·X·Y)",
  kind: "doubleCombo",
  anchors: 4,
  color: "#6aa84f",
  iconPath: "M4.5 6.5L9.5 17.5L15.5 12.5L23.5 23.5M4.5 23.5h6",
});
