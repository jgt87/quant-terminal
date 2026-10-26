// Shared definition of the three-anchor two-line channels (Disjoint channel, Flat top/bottom):
// catalog fields (line, extends, line ends, prices, background, label text), rendering,
// hit-testing and the four handles (both ends of both lines).

import { distanceToExtendedSegment, pointInPolygon, type Anchor, type Drawing, type Point } from "@qt/core";
import { FONT_SIZES } from "../../schema";
import { arrowHead, drawText, extend, fillColor, line, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, Mods, SettingsField, ToolGeom } from "../../types";

type Lines = [[Anchor, Anchor], [Anchor, Anchor]];

const ENDS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Arrow" },
];

export interface TwoLineChannelOptions {
  type: string;
  catalogType: string;
  label: string;
  menuName: string;
  color: string;
  iconPath: string;
  iconFill?: string;
  /** Both lines from the three anchors (second line from the third anchor). */
  lines(a: Anchor, b: Anchor, c: Anchor): Lines;
  /** Handle 2 / 3 (start / end of the second line) dragged to `to`: the new anchors. */
  dragSecond(anchors: Anchor[], end: 0 | 1, to: Anchor): Anchor[];
}

const withPrices = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, showPrices: true } });
const withLabel = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, labelText: (d.props?.labelText as string) || "Label" } });

function styleTab(color: string): SettingsField[] {
  return [
    { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: color },
    { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 2 },
    { kind: "lineStyle", key: "style.lineStyle", label: "Line style", catalog: "linestyle", default: "solid" },
    { kind: "checkbox", key: "props.extendLeft", label: "Extend left line", catalog: "extendLeft", default: false },
    { kind: "select", key: "props.leftEnd", label: "Left end", catalog: "leftEnd", options: ENDS, default: 0 },
    { kind: "checkbox", key: "props.extendRight", label: "Extend right line", catalog: "extendRight", default: false },
    { kind: "select", key: "props.rightEnd", label: "Right end", catalog: "rightEnd", options: ENDS, default: 0 },
    { kind: "checkbox", key: "props.showPrices", label: "Prices", catalog: "showPrices", default: false },
    { kind: "color", key: "style.textColor", label: "Prices color", catalog: "textcolor", default: color, testWith: withPrices },
    { kind: "fontSize", key: "style.textSize", label: "Prices font size", catalog: "fontsize", sizes: FONT_SIZES, default: 12, testWith: withPrices },
    { kind: "checkbox", key: "style.bold", label: "Prices bold", catalog: "bold", default: false, testWith: withPrices },
    { kind: "checkbox", key: "style.italic", label: "Prices italic", catalog: "italic", default: false, testWith: withPrices },
    { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
    { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: `${color}33`, showIf: (d) => prop(d, "fillBackground", true) },
  ];
}

function textTab(color: string): SettingsField[] {
  return [
    { kind: "text", key: "props.labelText", label: "Text", catalog: "labelText (derived)", multiline: true, maxLength: 2000, default: "" },
    { kind: "color", key: "props.labelTextColor", label: "Text color", catalog: "labelTextColor", default: color, testWith: withLabel },
    { kind: "fontSize", key: "props.labelFontSize", label: "Font size", catalog: "labelFontSize", sizes: FONT_SIZES, default: 14, testWith: withLabel },
    { kind: "checkbox", key: "props.labelBold", label: "Bold", catalog: "labelBold", default: false, testWith: withLabel },
    { kind: "checkbox", key: "props.labelItalic", label: "Italic", catalog: "labelItalic", default: false, testWith: withLabel },
    {
      kind: "select",
      key: "props.labelVertAlign",
      label: "Text alignment (vertical)",
      catalog: "labelVertAlign",
      options: [
        { value: "bottom", label: "Top" },
        { value: "middle", label: "Inside" },
        { value: "top", label: "Bottom" },
      ],
      default: "bottom",
      testWith: withLabel,
    },
    {
      kind: "select",
      key: "props.labelHorzAlign",
      label: "Text alignment (horizontal)",
      catalog: "labelHorzAlign",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
      default: "left",
      testWith: withLabel,
    },
  ];
}

/** Pixel ends of a line with the drawing's extends (left = beyond the first point). */
function extended(d: Drawing, p: Point, q: Point, far?: number): [Point, Point] {
  return [prop(d, "extendLeft", false) ? extend(q, p, far) : p, prop(d, "extendRight", false) ? extend(p, q, far) : q];
}

export function makeTwoLineChannel(o: TwoLineChannelOptions): DrawingToolDef {
  const anchorLines = (d: Drawing): [Anchor, Anchor][] | null => {
    const [a, b, c] = d.anchors;
    if (!a || !b) return null;
    return c ? o.lines(a, b, c) : [[a, b]];
  };
  const px = (d: Drawing, g: ToolGeom): [Point, Point][] | null =>
    anchorLines(d)?.map(([s, e]) => [g.toPx(s), g.toPx(e)] as [Point, Point]) ?? null;
  const handles = (d: Drawing, g: ToolGeom): Point[] => {
    const [a, b, c] = d.anchors;
    if (!a || !b || !c) return d.anchors.map((x) => g.toPx(x));
    const [, l2] = o.lines(a, b, c);
    return [g.toPx(a), g.toPx(b), g.toPx(l2[0]), g.toPx(l2[1])];
  };
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "channels",
    label: o.label,
    menuName: o.menuName,
    icon: o.type,
    iconPath: o.iconPath,
    iconFill: o.iconFill,
    anchors: 3,
    alert: "band",
    floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"],
    defaults: { width: 2, lineStyle: "solid", color: o.color, textColor: o.color, textSize: 12, bold: false, italic: false, fillColor: `${o.color}33` },
    defaultProps: {
      extendLeft: false,
      leftEnd: 0,
      extendRight: false,
      rightEnd: 0,
      showPrices: false,
      fillBackground: true,
      labelTextColor: o.color,
      labelFontSize: 14,
      labelBold: false,
      labelItalic: false,
      labelText: "",
      labelVertAlign: "bottom",
      labelHorzAlign: "left",
    },
    settings: { coordinates: false, style: styleTab(o.color), text: textTab(o.color) },
    hitTest(d, g, x, y, tol) {
      const ls = px(d, g);
      if (!ls) return false;
      const l = prop(d, "extendLeft", false);
      const r = prop(d, "extendRight", false);
      if (ls.some(([p, q]) => distanceToExtendedSegment(x, y, p, q, l, r) <= tol)) return true;
      if (ls.length === 2 && prop(d, "fillBackground", true)) {
        const [u0, u1] = extended(d, ...ls[0], 4000);
        const [v0, v1] = extended(d, ...ls[1], 4000);
        return pointInPolygon(x, y, [u0, u1, v1, v0]);
      }
      return false;
    },
    render(c, d) {
      const ls = px(d, c);
      if (!ls) return;
      const { ctx } = c;
      const ext = ls.map(([p, q]) => extended(d, p, q));
      if (ext.length === 2 && prop(d, "fillBackground", true)) {
        ctx.save();
        ctx.fillStyle = fillColor(d, c.color);
        ctx.beginPath();
        ctx.moveTo(ext[0][0].x, ext[0][0].y);
        ctx.lineTo(ext[0][1].x, ext[0][1].y);
        ctx.lineTo(ext[1][1].x, ext[1][1].y);
        ctx.lineTo(ext[1][0].x, ext[1][0].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ls.forEach(([p, q], i) => {
        line(ctx, ext[i][0], ext[i][1]);
        if (prop(d, "leftEnd", 0) === 1) arrowHead(ctx, q, p, 6 + ctx.lineWidth * 2);
        if (prop(d, "rightEnd", 0) === 1) arrowHead(ctx, p, q, 6 + ctx.lineWidth * 2);
      });
      if (prop(d, "showPrices", false)) drawPrices(c, d, ls, anchorLines(d)!);
      drawLabel(c, d, ls);
    },
    handles,
    onAnchorDrag(d: Drawing, i: number, to: Anchor, _g: ToolGeom, _m: Mods): Drawing {
      const anchors = [...d.anchors];
      if (i < 2 || anchors.length < 3) {
        anchors[i] = to;
        if (anchors[2] && i === 0) anchors[2] = { ...anchors[2], time: to.time };
        return { ...d, anchors };
      }
      return { ...d, anchors: o.dragSecond(anchors, i === 2 ? 0 : 1, to) };
    },
    bounds(d, g) {
      const pts = handles(d, g);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = prop(d, "extendLeft", false) ? 0 : Math.min(...xs);
      const x1 = prop(d, "extendRight", false) ? g.viewport.width : Math.max(...xs);
      return { x: x0, y: Math.min(...ys), width: x1 - x0, height: Math.max(...ys) - Math.min(...ys) };
    },
  };
}

/** Price labels at both ends of both lines (Prices color / font size / bold / italic). */
function drawPrices(c: DrawCtx, d: Drawing, ls: [Point, Point][], al: [Anchor, Anchor][]): void {
  const st = { color: d.style?.textColor ?? c.color, size: d.style?.textSize ?? 12, bold: d.style?.bold, italic: d.style?.italic };
  ls.forEach((l, i) =>
    l.forEach((p, k) => {
      const right = p.x >= l[1 - k].x;
      drawText(c, c.formatPrice(al[i][k].price), p.x + (right ? 6 : -6), p.y, { ...st, align: right ? "left" : "right", baseline: "middle" });
    }),
  );
}

/** Label text: horizontal position along the lines, vertical above / inside / below the channel. */
function drawLabel(c: DrawCtx, d: Drawing, ls: [Point, Point][]): void {
  const text = prop(d, "labelText", "");
  if (!text) return;
  const horz = prop(d, "labelHorzAlign", "left");
  const vert = prop(d, "labelVertAlign", "bottom");
  const t = horz === "left" ? 0 : horz === "right" ? 1 : 0.5;
  const at = (l: [Point, Point]) => ({ x: l[0].x + (l[1].x - l[0].x) * t, y: l[0].y + (l[1].y - l[0].y) * t });
  const pts = ls.map(at);
  const top = pts.reduce((m, p) => (p.y < m.y ? p : m));
  const bottom = pts.reduce((m, p) => (p.y > m.y ? p : m));
  const pos = vert === "bottom" ? { x: top.x, y: top.y - 6 } : vert === "top" ? { x: bottom.x, y: bottom.y + 6 } : { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 };
  const size = prop(d, "labelFontSize", 14);
  drawText(c, text, pos.x, pos.y, {
    color: prop(d, "labelTextColor", c.color),
    size,
    bold: prop(d, "labelBold", false),
    italic: prop(d, "labelItalic", false),
    align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
    baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
  });
}
