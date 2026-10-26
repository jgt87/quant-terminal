// Anchored note (catalog LineToolNoteAbsolute, not in the toolbar): the Pin note, anchored to
// the pane by default and without a Coordinates tab.

import type { DrawingToolDef } from "../../types";
import { makePin } from "./pin";

export const noteAbsolute: DrawingToolDef = {
  ...makePin({ type: "noteAbsolute", catalogType: "LineToolNoteAbsolute", label: "Anchored note", anchored: true, coordinates: false }),
  toolbar: false,
};
