// "Save image": the chart's scene and crosshair canvases composited under a legend header on the
// theme background. Layout and header text are pure; compositing needs the DOM.

import { font, type ChartTheme } from "../theme";

export interface PngLayout {
  width: number;
  height: number;
  header: number;
  /** Output pixels per CSS pixel. */
  scale: number;
}

export const HEADER_LINE = 18;
export const HEADER_PAD = 8;

/** Output size for a chart of w×h CSS px with `lines` header lines at device pixel ratio `dpr`. */
export function pngLayout(w: number, h: number, dpr: number, lines: number): PngLayout {
  const header = lines > 0 ? HEADER_PAD * 2 + lines * HEADER_LINE : 0;
  const scale = Math.max(1, dpr);
  return { width: Math.round(w * scale), height: Math.round((h + header) * scale), header, scale };
}

/** Header lines: symbol line first, then one line per indicator / compare symbol (max 8). */
export function pngHeaderLines(title: string, items: readonly string[], max = 8): string[] {
  const rest = items.slice(0, max);
  if (items.length > max) rest.push(`+${items.length - max} more`);
  return [title, ...rest];
}

/** Composites the layers under the header; resolves to a PNG blob. */
export function compositePng(layers: HTMLCanvasElement[], cssW: number, cssH: number, dpr: number, lines: string[], theme: ChartTheme): Promise<Blob> {
  const L = pngLayout(cssW, cssH, dpr, lines.length);
  const c = document.createElement("canvas");
  c.width = L.width;
  c.height = L.height;
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D is not available"));
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.save();
  ctx.scale(L.scale, L.scale);
  lines.forEach((t, i) => {
    ctx.font = font(theme, i === 0 ? 13 : 11, i === 0 ? 700 : 400);
    ctx.fillStyle = i === 0 ? theme.text : theme.axisText;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(t, HEADER_PAD, HEADER_PAD + i * HEADER_LINE + HEADER_LINE / 2);
  });
  ctx.restore();
  for (const layer of layers) ctx.drawImage(layer, 0, Math.round(L.header * L.scale), L.width, Math.round(cssH * L.scale));
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
}
