// Settings-schema helpers: reading/writing a field path on a drawing and the common field sets
// tools compose their Style / Text tabs from.

import type { Drawing } from "@qt/core";
import type { ChartTheme } from "../theme";
import { fillFields, styleFields, textFields } from "./builders";
import type { FieldKey, SettingsField } from "./types";

/** Value at a field path (`style.color`, `props.extendLeft`, `text`, `locked`, `name`). */
export function getField(d: Drawing, key: FieldKey): unknown {
  if (key.startsWith("style.")) return (d.style as Record<string, unknown> | undefined)?.[key.slice(6)];
  if (key.startsWith("props.")) return d.props?.[key.slice(6)];
  return (d as unknown as Record<string, unknown>)[key];
}

/** Returns a new drawing with the field set (undefined removes it). */
export function setField(d: Drawing, key: FieldKey, value: unknown): Drawing {
  if (key.startsWith("style.") || key.startsWith("props.")) {
    const bag = key.startsWith("style.") ? "style" : "props";
    const k = key.slice(6);
    const cur = { ...((d[bag] as Record<string, unknown> | undefined) ?? {}) };
    if (value === undefined) delete cur[k];
    else cur[k] = value;
    // A line-style choice replaces any legacy explicit dash pattern.
    if (bag === "style" && k === "lineStyle") delete cur.dash;
    const next = { ...d, [bag]: cur } as Drawing;
    if (!Object.keys(cur).length) delete next[bag];
    return next;
  }
  const next = { ...d } as unknown as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as Drawing;
}

/** Field value with its default (theme-dependent defaults resolved). */
export function fieldValue(d: Drawing, f: SettingsField, theme: ChartTheme): unknown {
  if (f.kind === "section") return undefined;
  let v = f.get ? f.get(d) : getField(d, f.key);
  // Old builds stored boolean select values as "true" / "false" strings.
  if (f.kind === "select" && typeof v === "string" && (v === "true" || v === "false") && f.options.some((o) => typeof o.value === "boolean")) v = v === "true";
  if (v !== undefined) return v;
  return typeof f.default === "function" ? (f.default as (t: ChartTheme, d: Drawing) => unknown)(theme, d) : f.default;
}

/** Line color, width, style and opacity (every line-based tool). */
export const LINE_FIELDS: SettingsField[] = styleFields();

/** Background fill color + opacity (shapes, channels, fib, ranges). */
export const FILL_FIELDS: SettingsField[] = fillFields();

/** Extend left / right (lines, channels, fib levels). */
export const EXTEND_FIELDS: SettingsField[] = styleFields({ line: false, extend: true });

/** Text tab of text tools. */
export const TEXT_FIELDS: SettingsField[] = textFields();

/** Font sizes offered by the settings window and the floating toolbar. */
export const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];

/** Field of a schema by key (any tab). */
export function findField(schema: { style: SettingsField[]; inputs?: SettingsField[]; text?: SettingsField[] }, key: FieldKey): SettingsField | undefined {
  return [...schema.style, ...(schema.inputs ?? []), ...(schema.text ?? [])].find((f) => f.kind !== "section" && f.key === key);
}

/** Writes a field value (the field's own `set` for derived fields, else its key path). */
export function fieldSet(d: Drawing, f: SettingsField, v: unknown): Drawing {
  if (f.kind === "section") return d;
  return f.set ? f.set(d, v) : setField(d, f.key, v);
}
