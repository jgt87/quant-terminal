// Gann square (catalog LineToolGannComplex): a 5 x 5 Gann grid between two corners with level
// lines, fan lines and arcs from the origin, arc bands, an optional fixed price/bar ratio (the
// second corner's price follows the bar span) and "ranges and ratio" labels (price range, bars,
// price per bar).

import { gannConstrainRatio, gannPriceBarRatio, type Anchor, type Drawing } from "@qt/core";
import { checkbox, numberField } from "../../builders";
import { prop } from "../../draw";
import { FONT_SIZES } from "../../schema";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { everyRow, label, num } from "./common";
import { ARCROWS, FANS, LEVELS, hitSquare, renderSquare, squareDefaultProps, squareStyleFields } from "./squareCommon";

/** Second corner with the fixed price/bar ratio applied (when one is set). */
function corner(d: Drawing, intervalSec: number): Anchor | undefined {
  const [a, b] = d.anchors;
  if (!a || !b) return b;
  const r = d.props?.scaleRatio;
  return gannConstrainRatio(a, b, typeof r === "number" ? r : null, intervalSec);
}

const withLabels = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, showLabels: true } });

export const gannSquare: DrawingToolDef = {
  type: "gannSquare",
  catalogType: "LineToolGannComplex",
  family: "gann",
  label: "Gann square",
  icon: "gannSquare",
  iconPath: "M5.5 5.5h17v17h-17zM5.5 22.5L22.5 5.5M5.5 22.5L22.5 14M5.5 22.5L14 5.5M5.5 14.5A8 8 0 0 1 13.5 22.5",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaults: { width: 2 },
  defaultProps: { ...squareDefaultProps(), scaleRatio: null, showLabels: true, labelsStyle_fontSize: 12, labelsStyle_bold: false, labelsStyle_italic: false },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": everyRow([LEVELS, FANS, ARCROWS], "color"), "line-tool-width": everyRow([LEVELS, FANS, ARCROWS], "width") },
  settings: {
    coordinates: "time-price",
    style: [
      ...squareStyleFields(),
      { ...numberField("props.scaleRatio", "Price/bar ratio", 0, { min: 0, step: 0.0001 }), default: null, catalog: "scaleRatio", testValue: 0.5 },
      { ...checkbox("props.showLabels", "Ranges and ratio", true), catalog: "showLabels" },
      { kind: "fontSize", key: "props.labelsStyle_fontSize", label: "Ranges and ratio font size", catalog: "labelsStyle.fontSize", sizes: FONT_SIZES, default: 12, testWith: withLabels },
      { ...checkbox("props.labelsStyle_bold", "Ranges and ratio bold", false), catalog: "labelsStyle.bold", testWith: withLabels },
      { ...checkbox("props.labelsStyle_italic", "Ranges and ratio italic", false), catalog: "labelsStyle.italic", testWith: withLabels },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const a = d.anchors[0];
    const b = corner(d, g.intervalSec);
    if (!a || !b) return false;
    return hitSquare(d, g.toPx(a), g.toPx(b), x, y, tol);
  },
  render(c, d) {
    const a = d.anchors[0];
    const b = corner(d, c.intervalSec);
    if (!a || !b) return;
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    renderSquare(c, d, pa, pb);
    if (prop(d, "showLabels", true)) {
      const size = prop(d, "labelsStyle_fontSize", 12);
      const bold = prop(d, "labelsStyle_bold", false);
      const italic = prop(d, "labelsStyle_italic", false);
      const color = c.theme.text;
      const bars = Math.round(Math.abs(b.time - a.time) / Math.max(1, c.intervalSec));
      const left = Math.min(pa.x, pb.x);
      const right = Math.max(pa.x, pb.x);
      const top = Math.min(pa.y, pb.y);
      const bottom = Math.max(pa.y, pb.y);
      label(c, `${c.formatPrice(Math.abs(b.price - a.price))}`, right + 6, (top + bottom) / 2, color, "left", "middle", size, bold, italic);
      label(c, `${bars} bars`, (left + right) / 2, bottom + 4, color, "center", "top", size, bold, italic);
      label(c, `${num(gannPriceBarRatio(a, b, c.intervalSec))} per bar`, (left + right) / 2, top - 4, color, "center", "bottom", size, bold, italic);
    }
  },
  handles(d, g: ToolGeom) {
    const a = d.anchors[0];
    const b = corner(d, g.intervalSec);
    return [a, b].filter((x): x is Anchor => !!x).map((x) => g.toPx(x));
  },
  onAnchorDrag(d, i, a, g) {
    const anchors = [...d.anchors];
    anchors[i] = a;
    const next = { ...d, anchors };
    const b = corner(next, g.intervalSec);
    if (b) anchors[1] = b;
    return { ...next, anchors };
  },
};
