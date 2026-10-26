// Ray: from the first anchor through the second, extended right (catalog LineToolRay).

import { makeLineTool } from "./lineTool";

export const ray = makeLineTool({
  type: "ray",
  catalogType: "LineToolRay",
  label: "Ray",
  menuName: "ray",
  icon: "ray",
  extendLeft: false,
  extendRight: true,
});
