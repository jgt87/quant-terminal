// Icons family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { emoji } from "./emoji";
import { icon } from "./icon";
import { sticker } from "./sticker";

export const ICONS: DrawingToolDef[] = [icon, emoji, sticker];
