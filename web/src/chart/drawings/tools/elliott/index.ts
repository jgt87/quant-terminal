// Elliott waves family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { elliottCorrection } from "./elliottCorrection";
import { elliottDoubleCombo } from "./elliottDoubleCombo";
import { elliottImpulse } from "./elliottImpulse";
import { elliottTriangle } from "./elliottTriangle";
import { elliottTripleCombo } from "./elliottTripleCombo";

export const ELLIOTT: DrawingToolDef[] = [elliottImpulse, elliottCorrection, elliottTriangle, elliottDoubleCombo, elliottTripleCombo];
