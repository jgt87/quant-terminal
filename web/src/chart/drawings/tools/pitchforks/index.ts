// Pitchforks family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { insidePitchfork } from "./inside";
import { modifiedSchiffPitchfork } from "./modifiedSchiff";
import { pitchfork } from "./pitchfork";
import { schiffPitchfork } from "./schiff";

export const PITCHFORKS: DrawingToolDef[] = [pitchfork, schiffPitchfork, modifiedSchiffPitchfork, insidePitchfork];
