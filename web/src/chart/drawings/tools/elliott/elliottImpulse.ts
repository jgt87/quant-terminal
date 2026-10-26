// Elliott impulse wave (1·2·3·4·5) (LineToolElliottImpulse): origin 0 and waves 1-5, numerals by degree.

import { elliottTool } from "./wave";

export const elliottImpulse = elliottTool({
  type: "elliottImpulse",
  catalogType: "LineToolElliottImpulse",
  label: "Elliott impulse wave (1·2·3·4·5)",
  kind: "impulse",
  anchors: 6,
  color: "#3d85c6",
  iconPath: "M3.5 23.5L8.5 13.5L11.5 18.5L17.5 6.5L20.5 12.5L24.5 5.5",
});
