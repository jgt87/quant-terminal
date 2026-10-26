// Vertical line: at the anchor time, full height or from the anchor down (catalog LineToolVertLine).
// Alt+V draws one at the cursor.

import { hitTestBody } from "@qt/core";
import { crisp } from "../../../canvas";
import { formatDate } from "../../../format";
import { anchorHandles, drawText, line, prop, textStyleOf } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { HLINE_FLOAT } from "./hline";
import { lineFields, lineTextFields } from "./lineTool";

export const vline: DrawingToolDef = {
  type: "vline",
  catalogType: "LineToolVertLine",
  family: "lines",
  label: "Vertical line",
  icon: "vline",
  anchors: 1,
  hotkey: "Alt+V",
  hotkeyAction: "draw-at-cursor",
  defaults: { color: "#2962ff", width: 2, lineStyle: "solid", textColor: "#2962ff", textSize: 14, bold: false, italic: false },
  defaultProps: { extendLine: true, showTime: true, vertLabelsAlign: "middle", horzLabelsAlign: "center", textOrientation: "vertical" },
  settings: {
    style: [
      ...lineFields(),
      { kind: "checkbox", key: "props.extendLine", label: "Extend", catalog: "extendLine", default: true },
      { kind: "checkbox", key: "props.showTime", label: "Time label", catalog: "showTime", default: false },
    ],
    text: [
      ...lineTextFields({ size: 14, vert: "middle" }),
      {
        kind: "select",
        key: "props.textOrientation",
        label: "Orientation",
        catalog: "textOrientation",
        options: [
          { value: "vertical", label: "Vertical" },
          { value: "horizontal", label: "Horizontal" },
        ],
        default: "vertical",
      },
    ],
    coordinates: "time",
  },
  alert: "line",
  floatingToolbar: HLINE_FLOAT,
  hitTest: (d, g, x, y, tol) => {
    if (prop(d, "extendLine", true)) return hitTestBody(d, g.toPx, x, y, tol, g.viewport);
    const p = g.toPx(d.anchors[0]);
    return Math.abs(x - p.x) <= tol && y >= p.y - tol;
  },
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    const p = c.toPx(a);
    const x = crisp(p.x, c.dpr);
    const top = prop(d, "extendLine", true) ? 0 : p.y;
    line(c.ctx, { x, y: top }, { x, y: c.height });
    if (prop(d, "showTime", false)) drawText(c, formatDate(a.time), x, c.height - 4, { color: c.color, size: 11, align: "center", baseline: "bottom", background: c.theme.boxBg });
    if (d.text) {
      const vert = prop(d, "vertLabelsAlign", "middle");
      const y = vert === "bottom" ? top + 8 : vert === "top" ? c.height - 24 : (top + c.height) / 2;
      const horz = prop(d, "horzLabelsAlign", "center");
      const vertical = prop(d, "textOrientation", "vertical") === "vertical";
      drawText(c, d.text, x + (horz === "left" ? -4 : horz === "right" ? 4 : 0), y, {
        ...textStyleOf(d, c, 14),
        align: horz === "left" ? "right" : horz === "right" ? "left" : "center",
        baseline: "middle",
        rotate: vertical ? -Math.PI / 2 : undefined,
      });
    }
  },
  handles: anchorHandles,
  bounds(d, g) {
    const p = g.toPx(d.anchors[0]);
    return { x: p.x, y: 0, width: 0, height: g.viewport.height };
  },
};
