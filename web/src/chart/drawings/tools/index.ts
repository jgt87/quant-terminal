// All registered drawing tools, family by family (order inside a family = flyout order).
// Family agents edit only their own tools/<family>/index.ts.

import type { DrawingToolDef } from "../types";
import { ARROWS } from "./arrows";
import { BRUSHES } from "./brushes";
import { CHANNELS } from "./channels";
import { CYCLES } from "./cycles";
import { ELLIOTT } from "./elliott";
import { FIBONACCI } from "./fibonacci";
import { GANN } from "./gann";
import { ICONS } from "./icons";
import { LINES } from "./lines";
import { MEASURE } from "./measure";
import { PATTERNS } from "./patterns";
import { PITCHFORKS } from "./pitchforks";
import { PROJECTION } from "./projection";
import { SHAPES } from "./shapes";
import { TEXT } from "./text";
import { VOLUME } from "./volume";

export const TOOLS: DrawingToolDef[] = [
  ...LINES,
  ...CHANNELS,
  ...PITCHFORKS,
  ...GANN,
  ...FIBONACCI,
  ...PATTERNS,
  ...ELLIOTT,
  ...CYCLES,
  ...PROJECTION,
  ...VOLUME,
  ...BRUSHES,
  ...ARROWS,
  ...SHAPES,
  ...TEXT,
  ...ICONS,
  ...MEASURE,
];
