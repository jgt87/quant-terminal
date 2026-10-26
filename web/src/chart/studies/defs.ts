// Built-in chart studies (volume profiles, TPO, candlestick and chart patterns, zig zag, auto
// fib). They live in the indicator list like any indicator (legend row, settings, visibility,
// removal) but draw their own geometry on the price pane instead of per-bar output series.

import { getIndicator, type IndicatorDef, type IndicatorInputDef } from "@qt/core";
import studies from "../../config/studies.json";

export type StudyId = "vp-visible" | "vp-session" | "tpo" | "candle-patterns" | "chart-patterns" | "zigzag" | "autofib";

export interface StudyDef extends IndicatorDef {
  study: StudyId;
}

export const STUDY_DEFS: StudyDef[] = (studies as { id: string; name: string; shortName: string; inputs: IndicatorInputDef[] }[]).map((s) => ({
  id: s.id,
  study: s.id as StudyId,
  name: s.name,
  shortName: s.shortName,
  pane: "overlay",
  inputs: s.inputs,
  outputs: [],
  compute: () => ({}),
}));

const BY_ID = new Map(STUDY_DEFS.map((d) => [d.id, d]));

export function studyDef(id: string): StudyDef | undefined {
  return BY_ID.get(id);
}

export function isStudy(def: IndicatorDef | undefined): def is StudyDef {
  return !!def && "study" in def;
}

/** Core indicator or built-in study by id. */
export function anyIndicator(id: string): IndicatorDef | undefined {
  return getIndicator(id) ?? BY_ID.get(id);
}

/** Studies that can be turned into editable drawings from the context menu. */
export const CONVERTIBLE: ReadonlySet<string> = new Set(["autofib", "chart-patterns", "zigzag"]);
