import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import themeJson from "../src/config/chartTheme.json";
import { asCanvasContext, fontAttrs, SvgContext } from "../src/chart/export/svgContext";
import { drawCandles } from "../src/chart/renderers/candles";
import { PriceScale } from "../src/chart/PriceScale";
import { TimeScale } from "../src/chart/TimeScale";
import { chartTheme, nextTheme, THEME_CYCLE } from "../src/chart/theme";
import { dataColumns, rowToIndex, visibleRows } from "../src/panels/data/dataTableModel";

describe("SVG context", () => {
  it("records paths, fills, strokes, dashes and transforms", () => {
    const svg = new SvgContext(100, 50);
    const ctx = asCanvasContext(svg);
    ctx.translate(10, 5);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 20, 10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(30, 0);
    ctx.setLineDash([4, 2]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,255,0.5)";
    ctx.stroke();
    const out = svg.toSvg();
    expect(out).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="100" height="50"/);
    expect(out).toContain(`<path d="M10 5L30 5L30 15L10 15Z" fill="#ff0000"/>`);
    expect(out).toContain(`d="M10 5L40 5" fill="none" stroke="rgba(0,0,255,0.5)" stroke-width="2"`);
    expect(out).toContain(`stroke-dasharray="4 2"`);
  });

  it("scales with setTransform, keeps state per save / restore and clips", () => {
    const svg = new SvgContext(200, 200);
    const ctx = asCanvasContext(svg);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.fillRect(1, 1, 2, 2);
    ctx.restore();
    ctx.fillRect(5, 5, 1, 1);
    const out = svg.toSvg();
    expect(out).toContain(`<clipPath id="c1"><path d="M0 0L20 0L20 20L0 20Z"/></clipPath>`);
    expect(out).toContain(`<path d="M2 2L6 2L6 6L2 6Z" fill="#000000" opacity="0.5" clip-path="url(#c1)"/>`);
    expect(out).toContain(`<path d="M10 10L12 10L12 12L10 12Z" fill="#000000"/>`);
  });

  it("writes text with font, anchor and baseline, escaped", () => {
    const svg = new SvgContext(100, 100);
    const ctx = asCanvasContext(svg);
    ctx.font = "600 11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText("A & <B>", 50, 20);
    expect(svg.toSvg()).toContain(`<text x="50" y="20" font-size="11" font-family="Inter, sans-serif" font-weight="600" text-anchor="end" dominant-baseline="central" fill="#fff" xml:space="preserve">A &amp; &lt;B&gt;</text>`);
    expect(fontAttrs("bogus")).toContain("sans-serif");
  });

  it("turns gradients into defs and arcs into segments; unknown calls do nothing", () => {
    const svg = new SvgContext(100, 100);
    const ctx = asCanvasContext(svg);
    const g = ctx.createLinearGradient(0, 0, 0, 100);
    g.addColorStop(0, "red");
    g.addColorStop(1, "blue");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(50, 50, 10, 0, Math.PI * 2);
    ctx.fill();
    (ctx as unknown as { somethingNew(): void }).somethingNew();
    const out = svg.toSvg();
    expect(out).toContain(`<linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>`);
    expect(out).toContain(`fill="url(#g1)"`);
    expect((out.match(/L/g) ?? []).length).toBeGreaterThan(30);
  });

  it("records a real chart renderer", () => {
    const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ time: i * 60, open: 10 + (i % 3), high: 14, low: 8, close: 10 + ((i + 1) % 3), volume: 1 }));
    const ts = new TimeScale();
    ts.setTimes(bars.map((b) => b.time), 60);
    ts.setWidth(300);
    ts.barSpacing = 9;
    const ps = new PriceScale();
    ps.setHeight(200);
    ps.fit(8, 14);
    const svg = new SvgContext(300, 200);
    const { from, to } = ts.visibleRange();
    drawCandles({ ctx: asCanvasContext(svg), ts, ps, width: 300, height: 200, from, to, dpr: 1, theme: chartTheme("dark") }, bars, "candles");
    expect((svg.toSvg().match(/<path /g) ?? []).length).toBeGreaterThan(10);
  });
});

describe("data table model", () => {
  const bars: Bar[] = [1, 2, 3].map((i) => ({ time: i, open: i, high: i + 1, low: i - 1, close: i + 0.5, volume: i * 10 }));
  it("has OHLCV plus one column per indicator output, rows newest first", () => {
    const cols = dataColumns(bars, [{ label: "MACD 12 26 9", outputs: [{ label: "MACD", series: [null, 1, 2] }, { label: "Signal", series: [null, null, 3] }] }]);
    expect(cols.map((c) => c.label)).toEqual(["Open", "High", "Low", "Close", "Volume", "MACD 12 26 9 · MACD", "MACD 12 26 9 · Signal"]);
    expect(rowToIndex(0, 3)).toBe(2);
    expect(cols[5].value(rowToIndex(0, 3))).toBe(2);
    expect(cols[6].value(0)).toBeNull();
    expect(visibleRows(220, 110, 22, 1000, 2)).toEqual({ first: 8, last: 17 });
    expect(visibleRows(0, 500, 22, 3)).toEqual({ first: 0, last: 2 });
  });
});

describe("high-contrast theme", () => {
  it("defines every chart color and cycles dark → light → high contrast", () => {
    expect(Object.keys(themeJson.contrast).sort()).toEqual(Object.keys(themeJson.dark).sort());
    expect(chartTheme("contrast").background).toBe("#000000");
    expect(THEME_CYCLE.map(nextTheme)).toEqual(["light", "contrast", "dark"]);
  });
});
