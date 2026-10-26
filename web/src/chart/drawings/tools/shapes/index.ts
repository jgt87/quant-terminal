// Shapes family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { arc } from "./arc";
import { circle } from "./circle";
import { curve } from "./curve";
import { doubleCurve } from "./doubleCurve";
import { ellipse } from "./ellipse";
import { path } from "./path";
import { polyline } from "./polyline";
import { rectangle } from "./rectangle";
import { rotatedRectangle } from "./rotatedRectangle";
import { triangle } from "./triangle";

export const SHAPES: DrawingToolDef[] = [rectangle, rotatedRectangle, path, circle, ellipse, polyline, triangle, arc, curve, doubleCurve];
