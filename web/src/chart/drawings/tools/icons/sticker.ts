// Sticker (catalog LineToolSticker): a round badge (colored plate, light rim) carrying a
// built-in icon or an emoji. A chooser opens when the tool is picked; the choice can be changed in the Sticker tab; the resize handle sets the size.

import { ICON_DEFAULT_SIZE } from "@qt/core";
import { createElement } from "react";
import { prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { drawEmoji, drawIcon, EMOJI_SET, ICON_SET, iconGeometry, SIZE_FIELD, sizeOf } from "./iconKit";
import { IconPicker } from "./IconPicker";

/** Sticker choices: "icon:<id>" for icons, "emoji:<char>" for emoji. */
const CHOICES = [...ICON_SET.map((i) => ({ value: `icon:${i.id}`, label: i.label })), ...EMOJI_SET.map((e) => ({ value: `emoji:${e}`, label: e }))];

export const sticker: DrawingToolDef = {
  type: "sticker",
  catalogType: "LineToolSticker",
  family: "icons",
  label: "Sticker",
  icon: "sticker",
  iconPath: "M14 3.5a10.5 10.5 0 1 1 0 21a10.5 10.5 0 1 1 0-21z M14 8.5L15.5 12L19 12.3L16.4 14.6L17.2 18L14 16.2L10.8 18L11.6 14.6L9 12.3L12.5 12Z",
  anchors: 1,
  defaults: {},
  defaultProps: { size: ICON_DEFAULT_SIZE, sticker: "icon:rocket", plateColor: "#2962ff" },
  floatingToolbar: ["templates", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: [],
    tabs: [
      {
        id: "sticker",
        label: "Sticker",
        fields: [
          { kind: "select", key: "props.sticker", label: "Sticker", default: "icon:rocket", options: CHOICES },
          { kind: "color", key: "props.plateColor", label: "Badge color", default: "#2962ff" },
          SIZE_FIELD,
        ],
      },
    ],
  },
  // Picking the tool (flyout, face button or favorites bar) opens the chooser first.
  picker: (pick, cancel) => createElement(IconPicker, { kind: "sticker", pick, cancel }),
  ...iconGeometry(true),
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    const { ctx } = c;
    const p = c.toPx(a);
    const size = sizeOf(d);
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = prop(d, "plateColor", "#2962ff");
    ctx.fill();
    ctx.lineWidth = Math.max(2, size / 18);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const s = prop(d, "sticker", "icon:rocket");
    if (s.startsWith("emoji:")) drawEmoji(ctx, s.slice(6), p, size * 0.6);
    else drawIcon(ctx, s.slice(5), p, size * 0.58, "#ffffff");
  },
};
