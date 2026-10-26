// Extended line: the line through both anchors, extended both ways (catalog LineToolExtended).

import { makeLineTool } from "./lineTool";

export const extended = makeLineTool({
  type: "extended",
  catalogType: "LineToolExtended",
  label: "Extended line",
  menuName: "extended line",
  icon: "extended",
  extendLeft: true,
  extendRight: true,
});
