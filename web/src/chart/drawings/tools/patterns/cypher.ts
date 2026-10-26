// Cypher pattern (catalog LineToolCypherPattern): five points X-A-B-C-D, filled triangles XAB and
// BCD, ratio connectors XB (AB/XA), XC (XC/XA, the C extension) and AD (CD/XC, the D retracement).

import { iconDot, listLabels, patternTool } from "./common";

export const cypherPattern = patternTool({
  type: "cypherPattern",
  catalogType: "LineToolCypherPattern",
  label: "Cypher pattern",
  anchors: 5,
  color: "#2962FF",
  fill: "transparency",
  shape: "cypher",
  ratios: "cypher",
  labels: listLabels(["X", "A", "B", "C", "D"]),
  iconPath: "M4.5 20.5L8.5 10.5L12.5 15.5L17.5 5.5L23.5 17.5M4.5 20.5L12.5 15.5L23.5 17.5",
  iconFill: iconDot(4.5, 20.5) + iconDot(17.5, 5.5),
});
