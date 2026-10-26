// Indicator output styling: per-indicator default colors (config/indicatorColors.json), a palette
// cycled per instance for single-line indicators, and the user's per-output overrides.

import type { IndicatorDef, IndicatorOutputDef, IndicatorStyle } from "@qt/core";
import colors from "../config/indicatorColors.json";
import { dashFor, type ChartTheme } from "./theme";

export interface ResolvedOutputStyle {
  color: string;
  dash: number[];
  width: number;
  visible: boolean;
  lineStyle: "solid" | "dashed" | "dotted";
}

export interface StyledIndicator {
  def: IndicatorDef;
  ordinal: number;
  style?: IndicatorStyle;
}

const DEFAULTS = colors as Record<string, Record<string, string>>;

/** Default color of output `j` before user overrides. */
export function defaultOutputColor(theme: ChartTheme, ind: StyledIndicator, j: number, out: IndicatorOutputDef): string {
  const fixed = DEFAULTS[ind.def.id]?.[out.key];
  if (fixed) return fixed;
  const pal = theme.indicatorPalette;
  return pal[(ind.ordinal + j) % pal.length];
}

export function outputStyle(theme: ChartTheme, ind: StyledIndicator, j: number, out: IndicatorOutputDef): ResolvedOutputStyle {
  const o = ind.style?.outputs?.[out.key];
  const width = o?.width ?? (out.style === "line" && j === 0 ? 1.5 : 1);
  const lineStyle = o?.lineStyle ?? "solid";
  return {
    color: o?.color ?? defaultOutputColor(theme, ind, j, out),
    width,
    lineStyle,
    dash: dashFor(lineStyle, width),
    visible: o?.visible !== false,
  };
}

/** Fill between band outputs (Bollinger, Donchian), or a translucent version of the band color. */
export function bandFill(ind: StyledIndicator): string | undefined {
  return DEFAULTS[ind.def.id]?.fill;
}

/** Faint fill between the outer guide levels (RSI 30/70, Stochastic 20/80). */
export function levelFill(ind: StyledIndicator): string | undefined {
  return DEFAULTS[ind.def.id]?.levelFill;
}
