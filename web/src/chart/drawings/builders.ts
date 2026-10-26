// Composable settings builders for tool modules. A tool's schema is fully its own: pick the
// tabs, fields and order; these helpers only save typing for the common blocks.
//
//   settings: {
//     style: [...styleFields({ extend: true, middlePoint: true, priceLabels: true, stats: true }), ...fillFields()],
//     text: textFields({ background: true }),
//     inputs: [numberField("props.period", "Period", 20, { min: 1 })],
//   }

import type { ChartTheme } from "../theme";
import type { Drawing } from "@qt/core";
import type { FieldKey, LevelRow, SettingsField, ValueField } from "./types";

const themeLine = (t: ChartTheme) => t.drawing;
/** Defaults that follow the drawing's own line color. */
const ownLine = (t: ChartTheme, d: Drawing) => d.style?.color ?? t.drawing;

export interface StyleFieldOptions {
  /** Line color/width/style/opacity (default true). */
  line?: boolean;
  /** Label of the color row (default "Line"). */
  colorLabel?: string;
  /** Extend left / extend right checkboxes (props.extendLeft / props.extendRight). */
  extend?: boolean;
  /** Middle point marker (props.middlePoint). */
  middlePoint?: boolean;
  /** Price labels at the anchors (props.priceLabels). */
  priceLabels?: boolean;
  /** Stats readout (props.showStats) and its position (props.statsPosition). */
  stats?: boolean;
  /** Arrow heads at start / end (props.arrowStart / props.arrowEnd). */
  arrows?: boolean;
  /** Background fill color + opacity. */
  fill?: boolean;
}

/** Style-tab block: line + optional extend / middle point / price labels / stats / arrows / fill. */
export function styleFields(o: StyleFieldOptions = {}): SettingsField[] {
  const out: SettingsField[] = [];
  if (o.line !== false) {
    out.push(
      { kind: "color", key: "style.color", label: o.colorLabel ?? "Line", default: themeLine },
      { kind: "width", key: "style.width", label: "Width", default: 1 },
      { kind: "lineStyle", key: "style.lineStyle", label: "Line style", default: "solid" },
      { kind: "opacity", key: "style.opacity", label: "Opacity", default: 1 },
    );
  }
  if (o.extend) out.push(checkbox("props.extendLeft", "Extend left"), checkbox("props.extendRight", "Extend right"));
  if (o.middlePoint) out.push(checkbox("props.middlePoint", "Middle point"));
  if (o.priceLabels) out.push(checkbox("props.priceLabels", "Price labels"));
  if (o.stats) {
    out.push(checkbox("props.showStats", "Show stats"), {
      kind: "select",
      key: "props.statsPosition",
      label: "Stats position",
      default: "right",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
      showIf: (d) => d.props?.showStats === true,
    });
  }
  if (o.arrows) out.push(checkbox("props.arrowStart", "Arrow at start"), checkbox("props.arrowEnd", "Arrow at end"));
  if (o.fill) out.push(...fillFields());
  return out;
}

/** Background block: fill color (optional) + fill opacity. */
export function fillFields(o: { color?: boolean; opacity?: number } = {}): SettingsField[] {
  const out: SettingsField[] = [];
  if (o.color !== false) out.push({ kind: "color", key: "style.fillColor", label: "Background", default: ownLine });
  out.push({ kind: "opacity", key: "style.fillOpacity", label: "Fill opacity", default: o.opacity ?? 0.12 });
  return out;
}

export interface TextFieldOptions {
  /** Max text length (default 2000). */
  maxLength?: number;
  /** Single-line text input instead of a textarea. */
  singleLine?: boolean;
  /** Background + border (callouts, notes, labels): props.textBackground / props.textBorder colors. */
  background?: boolean;
  /** Alignment select (props.textAlign). */
  align?: boolean;
  /** Word wrap width in px (props.wrapWidth). */
  wrap?: boolean;
  /** Default font size (11). */
  size?: number;
}

/** Text-tab block: text, color, font size, bold, italic, plus optional background/align/wrap. */
export function textFields(o: TextFieldOptions = {}): SettingsField[] {
  const out: SettingsField[] = [
    { kind: "text", key: "text", label: "Text", multiline: !o.singleLine, maxLength: o.maxLength ?? 2000 },
    { kind: "color", key: "style.textColor", label: "Text", default: ownLine },
    { kind: "fontSize", key: "style.textSize", label: "Font size", default: o.size ?? 11 },
    checkbox("style.bold", "Bold"),
    checkbox("style.italic", "Italic"),
  ];
  if (o.align) {
    out.push(select("props.textAlign", "Alignment", "left", [["left", "Left"], ["center", "Center"], ["right", "Right"]]));
  }
  if (o.background) {
    out.push(
      { kind: "color", key: "props.textBackground", label: "Background", default: (t: ChartTheme) => t.boxBg },
      { kind: "color", key: "props.textBorder", label: "Border", default: ownLine },
    );
  }
  if (o.wrap) out.push(numberField("props.wrapWidth", "Wrap width", 0, { min: 0, max: 2000, step: 10 }));
  return out;
}

/**
 * Level table (fib / gann / pitchfork / channel levels) stored in `key` (default style.levels).
 * `catalogPrefix` maps catalog keys `<prefix><n>.<coeff|visible|color|lineWidth|lineStyle>` onto
 * the rows; `lineColumns` adds per-row width and line style.
 */
export function levelTable(
  defaults: (theme: ChartTheme) => LevelRow[],
  o: { key?: FieldKey; label?: string; valueLabel?: string; catalogPrefix?: string; lineColumns?: boolean } = {},
): ValueField {
  return {
    kind: "levels",
    key: o.key ?? "style.levels",
    label: o.label ?? "Levels",
    valueLabel: o.valueLabel ?? "Value",
    defaults,
    lineColumns: o.lineColumns,
    catalogLevels: o.catalogPrefix ? { prefix: o.catalogPrefix } : undefined,
  };
}

export function checkbox(key: FieldKey, label: string, def = false, showIf?: (d: Drawing) => boolean): ValueField {
  return { kind: "checkbox", key, label, default: def, showIf };
}

export function numberField(key: FieldKey, label: string, def: number, o: { min?: number; max?: number; step?: number } = {}): ValueField {
  return { kind: "number", key, label, default: def, ...o };
}

export function select(key: FieldKey, label: string, def: string | number, options: [string | number, string][]): ValueField {
  return { kind: "select", key, label, default: def, options: options.map(([value, l]) => ({ value, label: l })) };
}

export function colorField(key: FieldKey, label: string, def?: string | ((t: ChartTheme, d: Drawing) => string), alpha = true): ValueField {
  return { kind: "color", key, label, default: def ?? ownLine, alpha };
}

export function section(label: string): SettingsField {
  return { kind: "section", label };
}


/**
 * Tags fields with the catalog keys they implement (conformance harness), e.g.
 * withCatalog(styleFields(), { "style.color": "linecolor", "style.width": "linewidth", "style.lineStyle": "linestyle" }).
 * Fields not in the map keep their current tag.
 */
export function withCatalog(fields: SettingsField[], map: Partial<Record<FieldKey, string>>): SettingsField[] {
  return fields.map((f) => (f.kind !== "section" && map[f.key] ? { ...f, catalog: map[f.key] } : f));
}

/** Catalog line-style choices (0 Solid, 1 Dotted, 2 Dashed) as stored values. */
export const CATALOG_LINESTYLE: Record<number, "solid" | "dotted" | "dashed"> = { 0: "solid", 1: "dotted", 2: "dashed" };

/** Catalog color string ("#2962FF", "rgba(41, 98, 255, 0.2)") as a stored "#rrggbb[aa]" value. */
export function catalogColor(v: string): string {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(v.trim());
  if (!m) return v.toLowerCase();
  const hx = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return `#${hx(+m[1])}${hx(+m[2])}${hx(+m[3])}${a < 1 ? hx(a * 255) : ""}`;
}
