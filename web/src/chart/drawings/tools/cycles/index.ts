// Cycles family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { cyclicLines } from "./cyclicLines";
import { sineLine } from "./sineLine";
import { timeCycles } from "./timeCycles";

export const CYCLES: DrawingToolDef[] = [cyclicLines, timeCycles, sineLine];
