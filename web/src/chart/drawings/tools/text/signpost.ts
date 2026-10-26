// Signpost (catalog LineToolSignpost): a text plate on a post standing above the anchor, with
// an optional emoji pin (emoji in a colored circle) on top of the plate.

import { textInRect, type Drawing } from "@qt/core";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, withProps } from "../shapes/kit";
import { drawLines, measureBox, paint, PLACEHOLDER, roundRect, styleOf, textEdit } from "./textKit";

const POST = 28;
const PIN = 24;
const withImage = withProps({ showImage: true });

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx">, c?: DrawCtx) {
  const p = g.toPx(d.anchors[0]);
  const st = styleOf(d, 12);
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 6, minWidth: 30 }, c);
  const box = { x: p.x - l.width / 2, y: p.y - POST - l.height, width: l.width, height: l.height };
  return { p, st, l, box };
}

export const signpost: DrawingToolDef = {
  type: "signpost",
  catalogType: "LineToolSignpost",
  family: "text",
  label: "Signpost",
  icon: "signpost",
  iconPath: "M14 24.5V13.5 M6.5 5.5H21.5V13.5H6.5Z",
  anchors: 1,
  defaultText: "",
  defaults: { textSize: 12, bold: false, italic: false },
  defaultProps: { showImage: false, plateColor: "#2962ff", emoji: "🙂" },
  floatingToolbar: ["templates", "font-size", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      F.check("props.showImage", "Emoji pin", "showImage", false),
      F.color("props.plateColor", "Emoji pin background", "plateColor", "#2962ff", { testWith: withImage }),
      { kind: "text", key: "props.emoji", label: "Emoji", catalog: "emoji", default: "🙂", maxLength: 8, testWith: withImage },
    ],
    text: [F.text("Text"), F.font("style.textSize", "Font size", "fontSize", 12), F.check("style.bold", "Bold", "bold", false), F.check("style.italic", "Italic", "italic", false)],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { p, box } = layoutOf(d, g);
    const top = prop(d, "showImage", false) ? box.y - PIN : box.y;
    return textInRect(x, y, { x: box.x, y: top, width: box.width, height: box.y + box.height - top }, tol) || (Math.abs(x - p.x) <= tol && y >= box.y && y <= p.y + tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx, theme } = c;
    const { p, st, l, box } = layoutOf(d, c, c);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, box.y + box.height);
    paint(ctx, null, theme.axisText, 2);
    roundRect(ctx, box, 4);
    paint(ctx, theme.boxBg, theme.axisText);
    drawLines(c, l, box, { ...st, color: theme.text }, "center");
    if (prop(d, "showImage", false)) {
      const cy = box.y - PIN / 2;
      ctx.beginPath();
      ctx.arc(p.x, cy, PIN / 2, 0, Math.PI * 2);
      paint(ctx, prop(d, "plateColor", "#2962ff"), null);
      ctx.save();
      ctx.font = `${Math.round(PIN * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(prop(d, "emoji", "🙂"), p.x, cy + 1);
      ctx.restore();
    }
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  editText: (d, g) => (d.anchors[0] ? textEdit(d, layoutOf(d, g).box, { size: d.style?.textSize ?? 12 }) : null),
  bounds(d, g) {
    const { p, box } = layoutOf(d, g);
    const top = prop(d, "showImage", false) ? box.y - PIN : box.y;
    return { x: box.x, y: top, width: box.width, height: p.y - top };
  },
};
