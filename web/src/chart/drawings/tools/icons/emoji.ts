// Emoji (catalog LineToolEmoji): a Unicode emoji from the curated list, centered on the anchor.
// A chooser opens when the tool is picked; the choice can be changed in the Emoji tab of the settings window; the resize handle sets the size.

import { ICON_DEFAULT_SIZE } from "@qt/core";
import { createElement } from "react";
import { prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { drawEmoji, EMOJI_SET, iconGeometry, SIZE_FIELD, sizeOf } from "./iconKit";
import { IconPicker } from "./IconPicker";

export const emoji: DrawingToolDef = {
  type: "emoji",
  catalogType: "LineToolEmoji",
  family: "icons",
  label: "Emoji",
  icon: "emoji",
  iconPath: "M14 4.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19z M9.5 16.5C11.5 19.5 16.5 19.5 18.5 16.5",
  iconFill: "M11 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  anchors: 1,
  defaults: {},
  defaultProps: { size: ICON_DEFAULT_SIZE, emoji: EMOJI_SET[0] },
  floatingToolbar: ["templates", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: [],
    tabs: [
      {
        id: "emoji",
        label: "Emoji",
        fields: [{ kind: "select", key: "props.emoji", label: "Emoji", default: EMOJI_SET[0], options: EMOJI_SET.map((e) => ({ value: e, label: e })) }, SIZE_FIELD],
      },
    ],
  },
  // Picking the tool (flyout, face button or favorites bar) opens the chooser first.
  picker: (pick, cancel) => createElement(IconPicker, { kind: "emoji", pick, cancel }),
  ...iconGeometry(),
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    drawEmoji(c.ctx, prop(d, "emoji", EMOJI_SET[0]), c.toPx(a), sizeOf(d));
  },
};
