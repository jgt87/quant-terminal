// Curve (catalog LineToolBezierQuadro): quadratic Bézier between two clicks with a draggable
// control point (stored as the third anchor once moved).

import { makeCurveTool } from "./bezier";

export const curve = makeCurveTool({
  cubic: false,
  type: "curve",
  catalogType: "LineToolBezierQuadro",
  label: "Curve",
  color: "#2962ff",
  background: "rgba(41, 98, 255, 0.2)",
  iconPath: "M4.5 21.5Q14 0.5 23.5 21.5",
  iconFill: "M4.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
