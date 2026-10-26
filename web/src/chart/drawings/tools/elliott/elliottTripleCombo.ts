// Elliott triple combo wave (W·X·Y·X·Z) (LineToolElliottTripleCombo): origin 0 and waves W-X-Y-X-Z.

import { elliottTool } from "./wave";

export const elliottTripleCombo = elliottTool({
  type: "elliottTripleCombo",
  catalogType: "LineToolElliottTripleCombo",
  label: "Elliott triple combo wave (W·X·Y·X·Z)",
  kind: "tripleCombo",
  anchors: 6,
  color: "#6aa84f",
  iconPath: "M3.5 4.5L7.5 12.5L10.5 9.5L15.5 17.5L18.5 14.5L24.5 23.5M3.5 23.5h6",
});
