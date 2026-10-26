// Shared pieces of the forecasting / measuring / volume tools: catalog font sizes, catalog colors
// with a transparency, label boxes and number formatting.

import type { Drawing } from "@qt/core";
import { withAlpha } from "../../../theme";
import { drawText, prop } from "../../draw";
import type { DrawCtx } from "../../types";

/** Font sizes of the catalog's text-style definitions. */
export const CATALOG_FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];

/**
 * A color drawn with a catalog transparency (percent) when it carries no alpha of its own
 * ("#2e2e2e" + 60 → 40 % opaque). Colors with an alpha channel keep it.
 */
export function withTransparency(color: string, transparencyPct: number): string {
  if (/^#[0-9a-f]{8}$/i.test(color)) return withAlpha(color, 1);
  return withAlpha(color, Math.max(0, Math.min(1, 1 - transparencyPct / 100)));
}

/** Opaque version of a "#rrggbb[aa]" color (label backgrounds in a zone's color). */
export function solid(color: string): string {
  return /^#[0-9a-f]{8}$/i.test(color) ? color.slice(0, 7) : color;
}

export interface LabelOpts {
  color: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  background?: string;
  border?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

/** Multi-line label box at (x, y); empty lists draw nothing. Returns the box (or null). */
export function labelBox(c: DrawCtx, lines: string[], x: number, y: number, o: LabelOpts): { x: number; y: number; width: number; height: number } | null {
  const text = lines.filter(Boolean).join("\n");
  if (!text) return null;
  return drawText(c, text, x, y, { color: o.color, size: o.size, bold: o.bold, italic: o.italic, background: o.background, border: o.border, align: o.align ?? "center", baseline: o.baseline ?? "middle" });
}

/** Number prop with a fallback (strings from inputs are parsed). */
export function numProp(d: Drawing, key: string, fallback: number): number {
  const v = Number(prop(d, key, fallback as unknown as number));
  return isFinite(v) ? v : fallback;
}

/** Thousands-separated number with fixed decimals. */
export function fmtNum(v: number, decimals = 2): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Compact volume (1.2K, 3.4M …). */
export function fmtVolume(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return `${Math.round(v)}`;
}
