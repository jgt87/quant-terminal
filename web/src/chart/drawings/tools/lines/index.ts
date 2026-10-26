// Lines family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { crossline } from "./crossline";
import { infoline } from "./infoline";
import { trendangle } from "./trendangle";
import { extended } from "./extended";
import { hline } from "./hline";
import { hray } from "./hray";
import { ray } from "./ray";
import { trendline } from "./trendline";
import { vline } from "./vline";

export const LINES: DrawingToolDef[] = [trendline, ray, extended, hline, hray, vline, infoline, trendangle, crossline];
