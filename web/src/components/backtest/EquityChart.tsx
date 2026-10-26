// Mini chart: equity (solid, accent) vs. buy-and-hold benchmark (dashed) on top, drawdown area below.

import { useEffect, useRef } from "react";
import type { EquityPoint } from "@qt/core";
import { formatCompact, formatDate } from "../../chart/format";
import { chartTheme, font, type ChartTheme } from "../../chart/theme";
import { useThemeMode } from "../../state/theme";

export function EquityChart({ equity }: { equity: EquityPoint[] }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mode = useThemeMode();

  useEffect(() => {
    const el = host.current!;
    const cv = canvas.current!;
    const theme = chartTheme(mode);
    const draw = () => paint(cv, el.clientWidth, el.clientHeight, equity, theme);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [equity, mode]);

  return (
    <div className="bt-equity" ref={host}>
      <canvas ref={canvas} />
    </div>
  );
}

function paint(cv: HTMLCanvasElement, w: number, h: number, eq: EquityPoint[], t: ChartTheme): void {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (eq.length < 2) return;

  const padL = 6;
  const padR = 56;
  const topH = Math.round(h * 0.66);
  const ddTop = topH + 6;
  const ddH = h - ddTop - 14;
  const plotW = w - padL - padR;
  const x = (i: number) => padL + (i / (eq.length - 1)) * plotW;

  let lo = Infinity;
  let hi = -Infinity;
  let ddMin = 0;
  for (const p of eq) {
    lo = Math.min(lo, p.equity, p.benchmark);
    hi = Math.max(hi, p.equity, p.benchmark);
    ddMin = Math.min(ddMin, p.drawdownPct);
  }
  if (hi === lo) hi = lo + 1;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (topH - 12);
  const yd = (v: number) => ddTop + (ddMin < 0 ? (v / ddMin) * ddH : 0);

  // Separator and labels.
  ctx.strokeStyle = t.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, Math.round(topH) + 0.5);
  ctx.lineTo(padL + plotW, Math.round(topH) + 0.5);
  ctx.stroke();
  ctx.font = font(t, 10);
  ctx.fillStyle = t.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatCompact(hi), padL + plotW + 6, y(hi));
  ctx.fillText(formatCompact(lo), padL + plotW + 6, y(lo));
  ctx.fillText(`${ddMin.toFixed(1)}%`, padL + plotW + 6, ddTop + ddH);
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(formatDate(eq[0].time), padL, h);
  ctx.textAlign = "right";
  ctx.fillText(formatDate(eq[eq.length - 1].time), padL + plotW, h);

  const line = (get: (p: EquityPoint) => number, yy: (v: number) => number) => {
    ctx.beginPath();
    eq.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), yy(get(p))) : ctx.lineTo(x(i), yy(get(p)))));
  };

  // Benchmark dashed grey, equity in the accent.
  line((p) => p.benchmark, y);
  ctx.strokeStyle = t.benchmark;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  line((p) => p.equity, y);
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Drawdown area.
  ctx.beginPath();
  ctx.moveTo(x(0), ddTop);
  eq.forEach((p, i) => ctx.lineTo(x(i), yd(p.drawdownPct)));
  ctx.lineTo(x(eq.length - 1), ddTop);
  ctx.closePath();
  ctx.fillStyle = t.drawdown;
  ctx.fill();
  ctx.font = font(t, 10);
  ctx.fillStyle = t.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Equity — strategy  - - buy & hold", padL + 2, 2);
  ctx.fillText("Drawdown", padL + 2, ddTop + 1);
}
