// Channels family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { disjointChannel } from "./disjoint";
import { flatBottom } from "./flatbottom";
import { regressionTrend } from "./regression";
import { channel } from "./channel";

export const CHANNELS: DrawingToolDef[] = [channel, regressionTrend, flatBottom, disjointChannel];
