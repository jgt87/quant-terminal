// Order flow signals for a chart (Binance symbols): absorption, stop runs and icebergs of the
// newest 60 bars, refreshed every 10 s. Computed on the server from footprints and the live book.

import { useEffect } from "react";
import type { Interval } from "@qt/core";
import { fetchFlowEvents } from "../api/orderflow";
import type { ChartEngine } from "../chart/ChartEngine";

const POLL_MS = 10_000;
const SIGNAL_INTERVALS = new Set<Interval>(["1m", "5m", "15m", "30m", "1h", "4h", "1D"]);

export function useFlowSignals(engine: ChartEngine | null, symbol: string, interval: Interval, on: boolean, provider: string | undefined, ready: boolean): void {
  const active = Boolean(engine) && ready && on && provider === "binance" && SIGNAL_INTERVALS.has(interval);
  useEffect(() => {
    if (!engine) return;
    if (!active) {
      engine.setFlowEvents([]);
      return;
    }
    let alive = true;
    const load = () =>
      fetchFlowEvents(symbol, interval)
        .then((r) => alive && engine.setFlowEvents(r.events))
        .catch(() => {
          /* optional overlay */
        });
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [engine, active, symbol, interval]);
}
