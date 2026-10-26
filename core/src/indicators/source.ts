// Price source extraction and input-reading helpers shared by indicator definitions.

import type { Bar, IndicatorInputDef, InputValue, Source } from "../types";

export const SOURCES: Source[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];

/** Extracts one price per bar for the given source. */
export function sourceValues(bars: Bar[], source: Source): number[] {
  switch (source) {
    case "open":
      return bars.map((b) => b.open);
    case "high":
      return bars.map((b) => b.high);
    case "low":
      return bars.map((b) => b.low);
    case "hl2":
      return bars.map((b) => (b.high + b.low) / 2);
    case "hlc3":
      return bars.map((b) => (b.high + b.low + b.close) / 3);
    case "ohlc4":
      return bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
    case "close":
    default:
      return bars.map((b) => b.close);
  }
}

/** Reads an integer input, falling back to the definition default and clamping to min/max. */
export function intInput(inputs: Record<string, InputValue>, def: IndicatorInputDef): number {
  const raw = inputs[def.key];
  let v = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : (def.default as number);
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

/** Reads a float input, falling back to the definition default and clamping to min/max. */
export function floatInput(inputs: Record<string, InputValue>, def: IndicatorInputDef): number {
  const raw = inputs[def.key];
  let v = typeof raw === "number" && Number.isFinite(raw) ? raw : (def.default as number);
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

/** Reads a source input, falling back to the definition default. */
export function sourceInput(inputs: Record<string, InputValue>, def: IndicatorInputDef): Source {
  const raw = inputs[def.key];
  return typeof raw === "string" && (SOURCES as string[]).includes(raw) ? (raw as Source) : (def.default as Source);
}

export function lengthInput(key: string, label: string, def: number): IndicatorInputDef {
  return { key, label, type: "int", default: def, min: 1, max: 1000, step: 1 };
}

export const SOURCE_INPUT: IndicatorInputDef = { key: "source", label: "Source", type: "source", default: "close" };
