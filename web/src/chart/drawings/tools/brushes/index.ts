// Brushes family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { brush } from "./brush";
import { highlighter } from "./highlighter";

export const BRUSHES: DrawingToolDef[] = [brush, highlighter];
