// Small tooltips over the chart: candlestick pattern names at the hovered bar and corporate
// event details over their time-axis badges.

import type { ChartEngine } from "../chart/ChartEngine";
import { eventText, type EventMarker } from "../chart/events";
import { candlePatternsAt } from "../chart/studies/render";

interface Props {
  engine: ChartEngine;
  hover: number | null;
  event: { marker: EventMarker; x: number; y: number } | null;
}

export function ChartTips({ engine, hover, event }: Props) {
  const patterns = hover != null ? candlePatternsAt(engine, hover) : [];
  const bar = hover != null ? engine.display[hover] : undefined;
  let patternTip = null;
  if (patterns.length && bar) {
    const x = engine.ts.indexToX(hover!) + engine.plotLeft;
    const y = Math.max(40, engine.mainPane.ps.toY(bar.high) + engine.mainPane.top - 34 - patterns.length * 16);
    patternTip = (
      <div className="chart-tip" style={{ left: x + 10, top: y }} data-testid="pattern-tip">
        {patterns.map((p, i) => (
          <div key={i} className={`tip-line ${p.bias}`}>
            {p.text}
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {patternTip}
      {event && (
        <div className="chart-tip event" style={{ left: event.x, top: event.y - 14 }} data-testid="event-tip">
          {event.marker.events.map((ev, i) => (
            <div key={i} className={`tip-line ${ev.kind}`}>
              {eventText(ev)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
