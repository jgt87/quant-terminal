// Balloon (catalog LineToolBalloon, not in the toolbar): the comment bubble in purple.

import { catalogColor } from "../../builders";
import type { DrawingToolDef } from "../../types";
import { makeBubble } from "./comment";

const bubble = makeBubble({
  type: "balloon",
  catalogType: "LineToolBalloon",
  label: "Balloon",
  size: 14,
  textColor: "#ffffff",
  bg: catalogColor("rgba(156, 39, 176, 0.7)"),
  border: catalogColor("rgba(156, 39, 176, 0)"),
  bgCatalog: "backgroundColor",
  icon: "M14 4.5C19.5 4.5 23.5 7.5 23.5 11.5S19.5 18.5 14 18.5L11.5 23.5L10.5 18.2C6.8 17.3 4.5 14.7 4.5 11.5C4.5 7.5 8.5 4.5 14 4.5Z",
});

export const balloon: DrawingToolDef = { ...bubble, toolbar: false };
