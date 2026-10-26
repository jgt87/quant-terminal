// Arrows family. Add a tool: create its module next to this file and append it here.
// Arrow mark left / right are registered for layouts that use them (not in the reference toolbar).

import type { DrawingToolDef } from "../../types";
import { arrow } from "./arrow";
import { arrowMarkDown, arrowMarkLeft, arrowMarkRight, arrowMarkUp } from "./arrowMark";
import { arrowMarker } from "./arrowMarker";

export const ARROWS: DrawingToolDef[] = [arrowMarker, arrow, arrowMarkUp, arrowMarkDown, arrowMarkLeft, arrowMarkRight];
