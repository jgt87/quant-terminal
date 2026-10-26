// Rectangle between two corner anchors (catalog LineToolRectangle): border, optional middle line,
// background, extend left/right, text inside/above/below. Hit on the border only.

import { hitTestBody } from "@qt/core";
import { FONT_SIZES } from "../../schema";
import { anchorHandles, drawText, fillColor, line, prop, strokeWith, textStyleOf } from "../../draw";
import type { DrawingToolDef, SettingsField } from "../../types";
import { HORZ_ALIGN } from "../lines/lineTool";

const ownLine = (t: { drawing: string }, d: { style?: { color?: string } }) => d.style?.color ?? t.drawing;
const withMiddle = (d: Parameters<NonNullable<SettingsField["showIf"]>>[0]) => ({ ...d, props: { ...d.props, middleLine_showLine: true } });

const style: SettingsField[] = [
  { kind: "color", key: "style.color", label: "Border", catalog: "color", default: (t: { drawing: string }) => t.drawing },
  { kind: "width", key: "style.width", label: "Border width", catalog: "linewidth", default: 1 },
  { kind: "lineStyle", key: "style.lineStyle", label: "Border style", catalog: "linestyle", default: "solid" },
  { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
  { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: ownLine },
  { kind: "checkbox", key: "props.middleLine_showLine", label: "Middle line", catalog: "middleLine.showLine", default: false },
  { kind: "color", key: "props.middleLine_lineColor", label: "Middle line color", catalog: "middleLine.lineColor", default: ownLine, testWith: withMiddle },
  { kind: "width", key: "props.middleLine_lineWidth", label: "Middle line width", catalog: "middleLine.lineWidth", default: 1, testWith: withMiddle },
  { kind: "lineStyle", key: "props.middleLine_lineStyle", label: "Middle line style", catalog: "middleLine.lineStyle", default: "dashed", testWith: withMiddle },
  { kind: "section", label: "Extend" },
  { kind: "checkbox", key: "props.extendLeft", label: "Extend left", catalog: "extendLeft", default: false },
  { kind: "checkbox", key: "props.extendRight", label: "Extend right", catalog: "extendRight", default: false },
];

const text: SettingsField[] = [
  { kind: "text", key: "text", label: "Text", catalog: "text (derived)", multiline: true, maxLength: 2000, default: "" },
  { kind: "color", key: "style.textColor", label: "Text color", catalog: "textColor", default: ownLine },
  { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "fontSize", sizes: FONT_SIZES, default: 14 },
  { kind: "checkbox", key: "style.bold", label: "Bold", catalog: "bold", default: false },
  { kind: "checkbox", key: "style.italic", label: "Italic", catalog: "italic", default: false },
  {
    kind: "select",
    key: "props.vertLabelsAlign",
    label: "Text alignment (vertical)",
    catalog: "vertLabelsAlign",
    options: [
      { value: "bottom", label: "Top" },
      { value: "middle", label: "Inside" },
      { value: "top", label: "Bottom" },
    ],
    default: "middle",
  },
  { kind: "select", key: "props.horzLabelsAlign", label: "Text alignment (horizontal)", catalog: "horzLabelsAlign", options: HORZ_ALIGN, default: "center" },
];

export const rectangle: DrawingToolDef = {
  type: "rectangle",
  catalogType: "LineToolRectangle",
  family: "shapes",
  label: "Rectangle",
  icon: "rectangle",
  anchors: 2,
  hotkey: "Alt+Shift+R",
  defaults: { color: "#9c27b0", width: 2, lineStyle: "solid", fillColor: "#9c27b033", textColor: "#9c27b0", textSize: 14, bold: false, italic: false },
  defaultProps: {
    fillBackground: true,
    middleLine_showLine: false,
    middleLine_lineWidth: 1,
    middleLine_lineStyle: "dashed",
    middleLine_lineColor: "#9c27b0",
    extendLeft: false,
    extendRight: false,
    vertLabelsAlign: "middle",
    horzLabelsAlign: "center",
  },
  settings: { style, text },
  alert: "band",
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"],
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const p = c.toPx(a);
    const q = c.toPx(b);
    let x0 = Math.min(p.x, q.x);
    let x1 = Math.max(p.x, q.x);
    if (prop(d, "extendLeft", false)) x0 = 0;
    if (prop(d, "extendRight", false)) x1 = c.width;
    const y0 = Math.min(p.y, q.y);
    const y1 = Math.max(p.y, q.y);
    if (prop(d, "fillBackground", true)) {
      ctx.fillStyle = fillColor(d, c.color);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (prop(d, "middleLine_showLine", false)) {
      ctx.save();
      strokeWith(ctx, prop(d, "middleLine_lineColor", c.color), prop(d, "middleLine_lineWidth", 1), prop(d, "middleLine_lineStyle", "dashed"));
      line(ctx, { x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 });
      ctx.restore();
    }
    if (d.text) {
      const vert = prop(d, "vertLabelsAlign", "middle");
      const horz = prop(d, "horzLabelsAlign", "center");
      const x = horz === "left" ? x0 + 4 : horz === "right" ? x1 - 4 : (x0 + x1) / 2;
      const y = vert === "bottom" ? y0 - 4 : vert === "top" ? y1 + 4 : (y0 + y1) / 2;
      drawText(c, d.text, x, y, {
        ...textStyleOf(d, c, 14),
        align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
        baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
      });
    }
  },
  handles: anchorHandles,
};
