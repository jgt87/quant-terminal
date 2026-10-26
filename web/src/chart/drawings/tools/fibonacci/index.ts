// Fibonacci family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { fib } from "./fib";
import { fibChannel } from "./channel";
import { fibExtension } from "./extension";
import { pitchfan } from "./pitchfan";
import { fibCircles, fibSpeedArcs, fibSpiral, fibWedge } from "./round";
import { fibSpeedFan } from "./speedfan";
import { fibTimeZone, fibTrendTime } from "./timezone";

export const FIBONACCI: DrawingToolDef[] = [
  fib,
  fibExtension,
  fibChannel,
  fibTimeZone,
  fibSpeedFan,
  fibTrendTime,
  fibCircles,
  fibSpiral,
  fibSpeedArcs,
  fibWedge,
  pitchfan,
];
