// Icon (catalog LineToolIcon): one of the built-in SVG icons, centered on the anchor, in one
// color. A chooser opens when the tool is picked; the choice can be changed in the Icon tab of the settings window; the resize handle sets the size.

import { ICON_DEFAULT_SIZE } from "@qt/core";
import { createElement } from "react";
import { prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { F } from "../shapes/kit";
import { drawIcon, ICON_SET, iconGeometry, SIZE_FIELD, sizeOf } from "./iconKit";
import { IconPicker } from "./IconPicker";

export const icon: DrawingToolDef = {
  type: "icon",
  catalogType: "LineToolIcon",
  family: "icons",
  label: "Icon",
  icon: "icon",
  iconPath: "M14 4.5L16.6 10.6L23 11.1L18.1 15.3L19.6 21.8L14 18.3L8.4 21.8L9.9 15.3L5 11.1L11.4 10.6Z",
  anchors: 1,
  defaults: { color: "#2962ff" },
  defaultProps: { size: ICON_DEFAULT_SIZE, icon: "star" },
  floatingToolbar: ["templates", "background-color", "settings", "lock", "remove", "more"],
  // The catalog's toolbar edits the icon color with its background-color button.
  floatBindings: { "background-color": "style.color" },
  settings: {
    coordinates: false,
    style: [F.color("style.color", "Color", "color", "#2962ff")],
    tabs: [
      {
        id: "icon",
        label: "Icon",
        fields: [{ kind: "select", key: "props.icon", label: "Icon", default: "star", options: ICON_SET.map((i) => ({ value: i.id, label: i.label })) }, SIZE_FIELD],
      },
    ],
  },
  // Picking the tool (flyout, face button or favorites bar) opens the chooser first.
  picker: (pick, cancel) => createElement(IconPicker, { kind: "icon", pick, cancel }),
  ...iconGeometry(),
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    drawIcon(c.ctx, prop(d, "icon", "star"), c.toPx(a), sizeOf(d), c.color);
  },
};
