// Text and notes family. Add a tool: create its module next to this file and append it here.

import type { DrawingToolDef } from "../../types";
import { text } from "./text";
import { callout } from "./callout";
import { balloon } from "./balloon";
import { comment } from "./comment";
import { flagMark } from "./flagMark";
import { noteAbsolute } from "./noteAbsolute";
import { pin } from "./pin";
import { priceLabel } from "./priceLabel";
import { priceNote } from "./priceNote";
import { signpost } from "./signpost";
import { table } from "./table";
import { textAbsolute } from "./textAbsolute";
import { textNote } from "./textNote";

export const TEXT: DrawingToolDef[] = [text, textNote, priceNote, pin, table, callout, comment, priceLabel, signpost, flagMark, textAbsolute, noteAbsolute, balloon];
