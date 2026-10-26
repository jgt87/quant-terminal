// Pure screener model: field metadata, filter drafts <-> request filters, presets and formatting.

import type { ScreenerField, ScreenerFilter, ScreenerRequest } from "@qt/core";
import { formatCompact, formatNumber, formatPct, formatPrice } from "../../chart/format";
import meta from "./fields.json";

export type FieldFormat = "price" | "pct" | "pctPlain" | "compact" | "ratio" | "num";
export interface FieldMeta {
  id: ScreenerField;
  label: string;
  short: string;
  format: FieldFormat;
}

export const FIELDS = meta.fields as FieldMeta[];
export const FIELD_IDS = FIELDS.map((f) => f.id);
export const OPS = meta.ops as { id: ScreenerFilter["op"]; label: string }[];
export const DEFAULT_COLUMNS = meta.defaultColumns as ScreenerField[];
export const REFRESH_OPTIONS = meta.refreshOptions;
export const fieldMeta = (id: ScreenerField): FieldMeta => FIELDS.find((f) => f.id === id) ?? { id, label: id, short: id, format: "num" };

export interface FilterDraft {
  field: ScreenerField;
  op: ScreenerFilter["op"];
  value: string;
  value2: string;
  otherField: ScreenerField;
}

export const isFieldOp = (op: ScreenerFilter["op"]) => op === "above-field" || op === "below-field";

export function newFilter(field: ScreenerField = "rsi14"): FilterDraft {
  return { field, op: ">", value: "", value2: "", otherField: "sma200" };
}

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** Drafts to request filters. Rows with a missing number are reported and left out. */
export function serializeFilters(drafts: FilterDraft[]): { filters: ScreenerFilter[]; errors: string[] } {
  const filters: ScreenerFilter[] = [];
  const errors: string[] = [];
  drafts.forEach((d, i) => {
    const label = `Filter ${i + 1} (${fieldMeta(d.field).label})`;
    if (isFieldOp(d.op)) {
      if (d.otherField === d.field) errors.push(`${label}: compare with a different field`);
      else filters.push({ field: d.field, op: d.op, otherField: d.otherField });
      return;
    }
    const v = num(d.value);
    if (v === null) {
      errors.push(`${label}: enter a number`);
      return;
    }
    if (d.op === "between") {
      const v2 = num(d.value2);
      if (v2 === null) {
        errors.push(`${label}: enter the upper bound`);
        return;
      }
      filters.push({ field: d.field, op: d.op, value: Math.min(v, v2), value2: Math.max(v, v2) });
      return;
    }
    filters.push({ field: d.field, op: d.op, value: v });
  });
  return { filters, errors };
}

/** Request filters (e.g. from a preset) back to editable drafts. */
export function filtersToDrafts(filters: ScreenerFilter[]): FilterDraft[] {
  return filters.map((f) => ({
    field: f.field,
    op: f.op,
    value: f.value !== undefined ? String(f.value) : "",
    value2: f.value2 !== undefined ? String(f.value2) : "",
    otherField: f.otherField ?? "sma200",
  }));
}

export function buildRequest(universe: string, drafts: FilterDraft[], columns: ScreenerField[], symbols?: string[]): { req: ScreenerRequest; errors: string[] } {
  const { filters, errors } = serializeFilters(drafts);
  const req: ScreenerRequest = { universe, filters };
  if (symbols?.length) req.symbols = symbols;
  // Values for every column plus every filtered field (so the table can show why a row matched).
  const cols = [...new Set<ScreenerField>([...columns, ...filters.map((f) => f.field)])];
  if (cols.length) req.columns = cols;
  return { req, errors };
}

// ---------- Presets ----------

export interface ScreenerPreset {
  name: string;
  universe: string;
  filters: ScreenerFilter[];
  columns: ScreenerField[];
}

export const BUILT_IN_PRESETS = meta.builtInPresets as ScreenerPreset[];

/** Insert or replace (by name) a preset; returns the new list sorted by name. */
export function upsertPreset(list: ScreenerPreset[], p: ScreenerPreset): ScreenerPreset[] {
  return [...list.filter((x) => x.name !== p.name), p].sort((a, b) => a.name.localeCompare(b.name));
}

/** Validate presets read from storage (drops anything malformed). */
export function sanitizePresets(raw: unknown): ScreenerPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ScreenerPreset =>
      typeof p === "object" && p !== null && typeof p.name === "string" && typeof p.universe === "string" && Array.isArray(p.filters) && Array.isArray(p.columns),
  );
}

// ---------- Formatting ----------

export function formatField(id: ScreenerField, v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  switch (fieldMeta(id).format) {
    case "price":
      return formatPrice(v);
    case "pct":
      return formatPct(v);
    case "pctPlain":
      return formatNumber(v, 2) + "%";
    case "compact":
      return formatCompact(v);
    case "ratio":
      return formatNumber(v, 2) + "×";
    default:
      return formatNumber(v, 1);
  }
}

/** Sign class for colored cells (pct fields only). */
export function fieldTone(id: ScreenerField, v: number | null | undefined): "" | "pos" | "neg" {
  if (v === null || v === undefined || fieldMeta(id).format !== "pct" || v === 0) return "";
  return v > 0 ? "pos" : "neg";
}
