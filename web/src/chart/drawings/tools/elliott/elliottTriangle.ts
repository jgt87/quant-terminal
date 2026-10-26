// Elliott triangle wave (A·B·C·D·E) (LineToolElliottTriangle): origin 0 and contracting waves A-E.

import { elliottTool } from "./wave";

export const elliottTriangle = elliottTool({
  type: "elliottTriangle",
  catalogType: "LineToolElliottTriangle",
  label: "Elliott triangle wave (A·B·C·D·E)",
  kind: "triangle",
  anchors: 6,
  color: "#ff9800",
  iconPath: "M3.5 5.5L8.5 22.5L12.5 9.5L16.5 19.5L20.5 12.5L24.5 16.5",
});
