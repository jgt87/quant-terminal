// Volume-based tools. Registered from the projection family index until tools/index.ts imports
// this folder (the shared index is owned elsewhere).

import type { DrawingToolDef } from "../../types";
import { anchoredVwapTool } from "./avwap";

export const VOLUME: DrawingToolDef[] = [anchoredVwapTool];
