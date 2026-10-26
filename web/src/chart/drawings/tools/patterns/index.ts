// Chart patterns family (flyout order of the catalog). Add a tool: create its module next to this
// file and append it here.

import type { DrawingToolDef } from "../../types";
import { abcdPattern } from "./abcd";
import { cypherPattern } from "./cypher";
import { headAndShoulders } from "./headAndShoulders";
import { threeDrives } from "./threeDrives";
import { trianglePattern } from "./triangle";
import { xabcdPattern } from "./xabcd";

export const PATTERNS: DrawingToolDef[] = [xabcdPattern, cypherPattern, headAndShoulders, abcdPattern, trianglePattern, threeDrives];
