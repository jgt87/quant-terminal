// "Values tooltip on long press" (cursor menu switch): pressing and holding on the chart shows the
// OHLC and indicator values of the bar under the pointer until the pointer is released.

import { useEffect, useState } from "react";
import type { ChartEngine } from "../chart/ChartEngine";
import { formatPrice } from "../chart/format";
import "../styles/valuestip.css";

interface Props {
  engine: ChartEngine;
  enabled: boolean;
}

const HOLD_MS = 450;

export function ValuesTooltip({ engine, enabled }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = engine.root;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    const pos = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      start = pos(ev);
      const p = start;
      timer = window.setTimeout(() => {
        const i = engine.ts.xToBar(p.x - engine.plotLeft);
        if (i >= 0 && i < engine.data.length) setTip({ x: p.x, y: p.y, index: i });
      }, HOLD_MS);
    };
    const move = (ev: PointerEvent) => {
      if (!start) return;
      const p = pos(ev);
      if (Math.hypot(p.x - start.x, p.y - start.y) > 5) {
        window.clearTimeout(timer);
        start = null;
      }
    };
    const up = () => {
      window.clearTimeout(timer);
      start = null;
      setTip(null);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [engine, enabled]);

  if (!tip) return null;
  const lg = engine.legend(tip.index);
  if (!lg) return null;
  const dec = engine.mainPane.ps.formatDecimals(lg.bar.close);
  const rows: [string, string][] = [
    ["O", formatPrice(lg.bar.open, dec)],
    ["H", formatPrice(lg.bar.high, dec)],
    ["L", formatPrice(lg.bar.low, dec)],
    ["C", formatPrice(lg.bar.close, dec)],
    ...lg.indicators.filter((i) => i.visible).map((i): [string, string] => [i.label, i.values.map((v) => (v.value == null ? "—" : formatPrice(v.value, dec))).join(" ")]),
  ];
  return (
    <div className="values-tip" role="tooltip" data-testid="values-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      {rows.map(([k, v]) => (
        <div key={k} className="values-row">
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
