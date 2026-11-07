// Order flow REST API (Binance symbols): taker buy/sell volume per bar, footprint bars and the
// latest trades.

import type { BarFlow, FlowEvent, FlowTrade, FootprintBar, Interval } from "@qt/core";
import { requestJson } from "./http";

const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

export const fetchFlow = (symbol: string, interval: Interval, from: number, to: number) =>
  requestJson<{ symbol: string; flow: BarFlow[] }>(`/api/orderflow/flow?${q({ symbol, interval, from, to })}`);

export const fetchFootprint = (symbol: string, interval: Interval, from: number, to: number, tick: number) =>
  requestJson<{ symbol: string; tick: number; complete: boolean; next?: number; bars: FootprintBar[] }>(`/api/orderflow/footprint?${q({ symbol, interval, from, to, tick })}`);

/** Recorded ticks in [from, to) (UTC seconds) for tick replay (Binance trades, MT5 ticks). */
export const fetchTicks = (symbol: string, from: number, to: number) =>
  requestJson<{ symbol: string; complete: boolean; ticks: { time: number; price: number; qty: number }[] }>(`/api/ticks?${q({ symbol, from, to })}`);

export const fetchTrades = (symbol: string, limit = 200) => requestJson<{ symbol: string; trades: FlowTrade[] }>(`/api/orderflow/trades?${q({ symbol, limit })}`);

/** Order flow signals (absorption, stop runs, icebergs) of the newest `count` bars. */
export const fetchFlowEvents = (symbol: string, interval: Interval, count = 60) =>
  requestJson<{ symbol: string; tick: number; complete: boolean; events: FlowEvent[] }>(`/api/orderflow/events?${q({ symbol, interval, count })}`);
