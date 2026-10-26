// Projection and measurement family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { barsPattern } from "./barsPattern";
import { ghostFeed } from "./ghostFeed";
import { longPosition, shortPosition } from "./position";
import { prediction } from "./prediction";
import { sector } from "./sector";
import { avprofile, vprofile } from "./vprofile";

export const PROJECTION: DrawingToolDef[] = [vprofile, avprofile, longPosition, shortPosition, prediction, barsPattern, ghostFeed, sector];
