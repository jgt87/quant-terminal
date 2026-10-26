// Double curve (catalog LineToolBezierCubic): cubic Bézier between two clicks with two draggable
// control points (stored as anchors 3 and 4 once moved).

import { makeCurveTool } from "./bezier";

export const doubleCurve = makeCurveTool({
  cubic: true,
  type: "doubleCurve",
  catalogType: "LineToolBezierCubic",
  label: "Double curve",
  color: "#673ab7",
  background: "rgba(103, 58, 183, 0.2)",
  iconPath: "M4.5 18.5C9.5 1.5 18.5 26.5 23.5 9.5",
  iconFill: "M4.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
