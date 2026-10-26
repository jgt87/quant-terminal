// Shared definition of the pitchfork tools (Pitchfork, Schiff, Modified Schiff, Inside): catalog
// fields (extend lines, median line, nine level rows with width/style, use one color,
// background + transparency, style select), rendering, hit-testing, floating-toolbar bindings
// and the Original / Schiff / Modified Schiff / Inside radio group that switches the variant in
// place. The geometry lives in core (drawings/pitchforks.ts).

import {
  hitTestPitchfork,
  pitchforkBand,
  pitchforkFrame,
  pitchforkLevelLines,
  pitchforkMedian,
  PITCHFORK_VARIANT,
  type Drawing,
  type FibLevel,
  type LineStyle,
  type Point,
} from "@qt/core";
import { withAlpha } from "../../../theme";
import { CATALOG_LINESTYLE, levelTable } from "../../builders";
import { anchorHandles, line, polyline, prop, strokeWith } from "../../draw";
import type { DrawCtx, DrawingToolDef, LevelRow, SettingsField } from "../../types";
import type { MenuItem } from "../../../../components/menuTypes";

/** Catalog level rows (coefficient, color, visible, width 2, solid). */
const CATALOG_LEVELS: [number, string, boolean][] = [
  [0.25, "#ffb74d", false],
  [0.382, "#81c784", false],
  [0.5, "#089981", true],
  [0.618, "#089981", false],
  [0.75, "#00bcd4", false],
  [1, "#2962ff", true],
  [1.5, "#9c27b0", false],
  [1.75, "#e91e63", false],
  [2, "#f77c80", false],
];

export const pitchforkDefaultLevels = (): LevelRow[] =>
  CATALOG_LEVELS.map(([ratio, color, visible]) => ({ ratio, color, visible, width: 2, lineStyle: CATALOG_LINESTYLE[0] }));

/** Variants in menu order with their tool types (variant id = catalog `style` value). */
export const PITCHFORK_VARIANTS: { id: number; label: string; type: string }[] = [
  { id: PITCHFORK_VARIANT.original, label: "Original", type: "pitchfork" },
  { id: PITCHFORK_VARIANT.schiff, label: "Schiff", type: "schiffPitchfork" },
  { id: PITCHFORK_VARIANT.modifiedSchiff, label: "Modified Schiff", type: "modifiedSchiffPitchfork" },
  { id: PITCHFORK_VARIANT.inside, label: "Inside", type: "insidePitchfork" },
];

/** Switches a pitchfork drawing to another variant in place (type and props.style). */
export function switchVariant(d: Drawing, id: number): Drawing {
  const v = PITCHFORK_VARIANTS.find((x) => x.id === id);
  return v ? { ...d, type: v.type, props: { ...d.props, style: v.id } } : d;
}

const MEDIAN = "#f23645";

function levelsOf(d: Drawing): FibLevel[] {
  return d.style?.levels?.length ? d.style.levels : pitchforkDefaultLevels();
}

/** One color for every line when "Use one color" is set. */
const oneColor = (d: Drawing): string | null => {
  const v = d.props?.linesColors;
  return typeof v === "string" && v ? v : null;
};

function styleTab(variant: number): SettingsField[] {
  return [
    { kind: "checkbox", key: "props.extendLines", label: "Extend lines", catalog: "extendLines", default: false },
    { kind: "section", label: "Median" },
    { kind: "color", key: "props.median_color", label: "Median color", catalog: "median.color", default: MEDIAN },
    { kind: "width", key: "props.median_linewidth", label: "Median width", catalog: "median.linewidth", default: 2 },
    { kind: "lineStyle", key: "props.median_linestyle", label: "Median style", catalog: "median.linestyle", default: "solid" },
    { kind: "section", label: "Levels" },
    levelTable(pitchforkDefaultLevels, { catalogPrefix: "level", lineColumns: true, valueLabel: "Coefficient" }),
    { kind: "color", key: "props.linesColors", label: "Use one color", catalog: "linesColors (derived)", default: null, testValue: "#ff00ff" },
    { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
    { kind: "number", key: "props.transparency", label: "Background transparency (%)", catalog: "transparency", default: 80, min: 0, max: 100, step: 1, showIf: (d) => prop(d, "fillBackground", true) },
    {
      kind: "select",
      key: "props.style",
      label: "Style",
      catalog: "style",
      options: [
        { value: 0, label: "Original" },
        { value: 3, label: "Schiff" },
        { value: 1, label: "Modified Schiff" },
        { value: 2, label: "Inside" },
      ],
      default: variant,
    },
  ];
}

export interface PitchforkToolOptions {
  type: string;
  catalogType: string;
  label: string;
  variant: number;
  iconPath: string;
  iconFill: string;
}

export function makePitchfork(o: PitchforkToolOptions): DrawingToolDef {
  const variantOf = (d: Drawing) => Number(prop(d, "style", o.variant));
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "pitchforks",
    label: o.label,
    icon: o.type,
    iconPath: o.iconPath,
    iconFill: o.iconFill,
    anchors: 3,
    floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
    floatBindings: {
      "line-tool-color": {
        get: (d) => oneColor(d) ?? prop(d, "median_color", MEDIAN),
        set: (d, v) => ({ ...d, props: { ...d.props, linesColors: v } }),
      },
      "line-tool-width": {
        get: (d) => prop(d, "median_linewidth", 2),
        set: (d, v) => ({
          ...d,
          props: { ...d.props, median_linewidth: v },
          style: { ...d.style, levels: levelsOf(d).map((l) => ({ ...l, width: Number(v) })) },
        }),
      },
    },
    defaults: {},
    defaultProps: {
      extendLines: false,
      median_linewidth: 2,
      median_linestyle: "solid",
      median_color: MEDIAN,
      linesColors: null,
      fillBackground: true,
      transparency: 80,
      style: o.variant,
    },
    settings: { coordinates: "time-price", style: styleTab(o.variant) },
    menuSection: (d, ctx): MenuItem[] =>
      PITCHFORK_VARIANTS.map((v) => ({
        id: `pitchfork-${v.type}`,
        label: v.label,
        checked: variantOf(d) === v.id,
        onSelect: () => ctx.update((x) => switchVariant(x, v.id)),
      })),
    hitTest(d, g, x, y, tol) {
      const [a, b, c] = d.anchors;
      if (!a || !b) return false;
      if (!c) return false;
      const coeffs = levelsOf(d).filter((l) => l.visible !== false).map((l) => l.ratio);
      return hitTestPitchfork(x, y, g.toPx(a), g.toPx(b), g.toPx(c), variantOf(d), coeffs, prop(d, "extendLines", false), prop(d, "fillBackground", true), tol);
    },
    render(c, d) {
      const [a, b, third] = d.anchors;
      if (!a || !b) return;
      const pa = c.toPx(a);
      const pb = c.toPx(b);
      if (!third) {
        // Creation preview before the third anchor: the handle line.
        line(c.ctx, pa, pb);
        return;
      }
      drawPitchfork(c, d, pa, pb, c.toPx(third), variantOf(d));
    },
    handles: anchorHandles,
  };
}

function drawPitchfork(c: DrawCtx, d: Drawing, pa: Point, pb: Point, pc: Point, variant: number): void {
  const { ctx } = c;
  const f = pitchforkFrame(pa, pb, pc, variant);
  const extendLines = prop(d, "extendLines", false);
  const one = oneColor(d);
  const levels = levelsOf(d)
    .filter((l) => l.visible !== false)
    .sort((x, y) => Math.abs(x.ratio) - Math.abs(y.ratio));
  if (prop(d, "fillBackground", true) && levels.length) {
    const alpha = 1 - Math.min(100, Math.max(0, Number(prop(d, "transparency", 80)))) / 100;
    ctx.save();
    let prev = 0;
    for (const l of levels) {
      const k = Math.abs(l.ratio);
      ctx.fillStyle = withAlpha(one ?? l.color ?? MEDIAN, alpha);
      for (const side of [1, -1] as const) {
        const poly = pitchforkBand(f, prev, k, side, extendLines);
        ctx.beginPath();
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }
      prev = k;
    }
    ctx.restore();
  }
  for (const l of levels) {
    ctx.save();
    strokeWith(ctx, one ?? l.color ?? MEDIAN, l.width ?? 2, (l.lineStyle as LineStyle | undefined) ?? "solid");
    for (const [s, e] of pitchforkLevelLines(f, l.ratio, extendLines)) line(ctx, s, e);
    ctx.restore();
  }
  ctx.save();
  strokeWith(ctx, one ?? prop(d, "median_color", MEDIAN), Number(prop(d, "median_linewidth", 2)), String(prop(d, "median_linestyle", "solid")));
  const [m0, m1] = pitchforkMedian(f, extendLines);
  line(ctx, m0, m1);
  // Handle: the base B–C, and A to the shifted median origin for the Schiff variants.
  line(ctx, pb, pc);
  if (f.origin.x !== pa.x || f.origin.y !== pa.y) polyline(ctx, [pa, f.origin]);
  ctx.restore();
}
