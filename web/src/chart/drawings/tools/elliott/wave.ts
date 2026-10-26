// Shared builder of the Elliott wave tools: the wave polyline through origin 0 and the wave
// points, labels (notation by degree, from core) above highs and below lows, the Degree ▸ menu
// section and the catalog Style fields (Color, Wave on/off, Wave width, Degree).

import { ELLIOTT_DEGREES, clampDegree, elliottLabelPosition, elliottLabelSides, hitElliott, labelFor, type Drawing, type ElliottWaveKind, type Point } from "@qt/core";
import { font } from "../../../theme";
import { anchorHandles, polyline, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField } from "../../types";
import type { MenuItem } from "../../../../components/menuTypes";

/** Label font size (px) of the wave labels. */
export const ELLIOTT_FONT = 12;

const DEGREE_OPTIONS = ELLIOTT_DEGREES.map((label, value) => ({ value, label }));

function styleFields(color: string): SettingsField[] {
  return [
    { kind: "color", key: "style.color", label: "Color", catalog: "color", default: color },
    { kind: "checkbox", key: "props.showWave", label: "Wave (on/off)", catalog: "showWave", default: true },
    { kind: "width", key: "style.width", label: "Wave / width", catalog: "linewidth", default: 2, testWith: (d) => ({ ...d, props: { ...d.props, showWave: true } }) },
    { kind: "select", key: "props.degree", label: "Degree", catalog: "degree", options: DEGREE_OPTIONS, default: 7 },
  ];
}

interface PlacedLabel {
  text: string;
  circled: boolean;
  center: Point;
  halfW: number;
  halfH: number;
}

/** Labels of the placed wave points (origin excluded), with their pixel boxes. */
export function placeLabels(d: Drawing, kind: ElliottWaveKind, toPx: (a: Drawing["anchors"][number]) => Point, measure?: (s: string) => number): PlacedLabel[] {
  const degree = clampDegree(d.props?.degree);
  const sides = elliottLabelSides(d.anchors.map((a) => a.price));
  const out: PlacedLabel[] = [];
  d.anchors.forEach((a, i) => {
    if (i === 0) return;
    const l = labelFor(degree, kind, i);
    if (!l.text) return;
    const w = measure ? measure(l.text) : l.text.length * ELLIOTT_FONT * 0.6;
    const halfH = l.circled ? Math.max(w, ELLIOTT_FONT) / 2 + 3 : ELLIOTT_FONT / 2 + 1;
    const halfW = l.circled ? halfH : w / 2 + 1;
    out.push({ text: l.text, circled: l.circled, center: elliottLabelPosition(toPx(a), sides[i], ELLIOTT_FONT, l.circled), halfW, halfH });
  });
  return out;
}

function degreeMenu(d: Drawing, update: (fn: (x: Drawing) => Drawing) => void): MenuItem[] {
  const current = clampDegree(d.props?.degree);
  return [
    {
      id: "degree",
      label: "Degree",
      submenu: ELLIOTT_DEGREES.map((name, i) => ({
        id: `degree-${i}`,
        label: name,
        checked: i === current,
        onSelect: () => update((x) => ({ ...x, props: { ...x.props, degree: i } })),
      })),
    },
  ];
}

function render(kind: ElliottWaveKind, c: DrawCtx, d: Drawing): void {
  const { ctx, theme } = c;
  if (!d.anchors.length) return;
  const pts = d.anchors.map((a) => c.toPx(a));
  const width = (d.style?.width ?? 2) + (c.selected || c.hovered ? 0.5 : 0);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = c.color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  if (prop(d, "showWave", true) && pts.length > 1) polyline(ctx, pts);
  ctx.font = font(theme, ELLIOTT_FONT, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = c.color;
  for (const l of placeLabels(d, kind, c.toPx, (s) => ctx.measureText(s).width)) {
    ctx.fillText(l.text, l.center.x, l.center.y);
    if (l.circled) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(l.center.x, l.center.y, l.halfW, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface ElliottToolSpec {
  type: string;
  catalogType: string;
  label: string;
  kind: ElliottWaveKind;
  anchors: number;
  color: string;
  iconPath: string;
  iconFill?: string;
}

export function elliottTool(s: ElliottToolSpec): DrawingToolDef {
  return {
    type: s.type,
    catalogType: s.catalogType,
    family: "elliott",
    label: s.label,
    icon: "elliott",
    iconPath: s.iconPath,
    iconFill: s.iconFill,
    anchors: s.anchors,
    defaults: { color: s.color, width: 2 },
    defaultProps: { showWave: true, degree: 7 },
    floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
    settings: { coordinates: "time-price", style: styleFields(s.color) },
    menuSection: (d, ctx) => degreeMenu(d, ctx.update),
    hitTest(d, g, x, y, tol) {
      const pts = d.anchors.map((a) => g.toPx(a));
      return hitElliott(pts, placeLabels(d, s.kind, g.toPx), prop(d, "showWave", true), x, y, tol);
    },
    render: (c, d) => render(s.kind, c, d),
    handles: anchorHandles,
    bounds(d, g) {
      const boxes = [...d.anchors.map((a) => g.toPx(a)).map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })), ...placeLabels(d, s.kind, g.toPx).map((l) => ({ x: l.center.x - l.halfW, y: l.center.y - l.halfH, w: 2 * l.halfW, h: 2 * l.halfH }))];
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.w));
      const y1 = Math.max(...boxes.map((b) => b.y + b.h));
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    },
  };
}
