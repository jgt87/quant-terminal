// Chart canvas theme: dark, light and high-contrast color blocks from config/chartTheme.json plus shared
// metrics, with optional per-layout overrides from the chart settings.

import type { ChartSettings } from "@qt/core";
import themeJson from "../config/chartTheme.json";

export type ThemeMode = "dark" | "light" | "contrast";

/** Theme toggle order: dark → light → high contrast → dark. */
export const THEME_CYCLE: readonly ThemeMode[] = ["dark", "light", "contrast"];
export const THEME_LABEL: Record<ThemeMode, string> = { dark: "Dark", light: "Light", contrast: "High contrast" };
export const nextTheme = (m: ThemeMode): ThemeMode => THEME_CYCLE[(THEME_CYCLE.indexOf(m) + 1) % THEME_CYCLE.length];
export type ChartTheme = typeof themeJson.common & typeof themeJson.dark & { mode: ThemeMode };

/** Theme for `mode` with the layout's color overrides applied. */
export function chartTheme(mode: ThemeMode, cs?: ChartSettings): ChartTheme {
  const t: ChartTheme = { ...themeJson.common, ...themeJson[mode], mode };
  const s = cs?.symbol;
  if (s) {
    if (s.upColor) t.upBody = t.up = s.upColor;
    if (s.downColor) t.downBody = t.down = s.downColor;
    if (s.upBorder) t.upBorder = s.upBorder;
    if (s.downBorder) t.downBorder = s.downBorder;
    if (s.upWick) t.upWick = s.upWick;
    if (s.downWick) t.downWick = s.downWick;
  }
  if (cs?.appearance?.background) t.background = cs.appearance.background;
  return t;
}

export const THEME: ChartTheme = chartTheme("dark");

export function font(theme: ChartTheme, size = theme.fontSize, weight = 400): string {
  return `${weight} ${size}px ${theme.fontFamily}`;
}

/** Canvas dash pattern for a line style. */
export function dashFor(style: "solid" | "dashed" | "dotted" | undefined, width = 1): number[] {
  if (style === "dashed") return [6 * Math.max(1, width * 0.75), 4];
  if (style === "dotted") return [Math.max(1, width), Math.max(2, width * 2)];
  return [];
}

/** #rgb / #rrggbb / #rrggbbaa with the alpha multiplied by `alpha` → rgba(). */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `rgba(${r},${g},${b},${Math.round(a * alpha * 1000) / 1000})`;
}
