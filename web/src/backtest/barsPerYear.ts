// Bars per year for annualizing backtest metrics, by interval and asset type.
// Assumptions live in config/sessions.json:
//   daily   = trading days (252 for stocks/ETFs/indices/futures/FX, 365 for crypto)
//   weekly  = 52, monthly = 12
//   intraday = trading days x ceil(session seconds / interval seconds), where the session is
//              6.5h for exchange-traded assets (so 1h = 7 bars/day incl. the partial last bar),
//              23h for futures, and 24h for FX and crypto.

import type { Interval, SymbolType } from "@qt/core";
import sessions from "../config/sessions.json";

const INTRADAY_SECONDS: Partial<Record<Interval, number>> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
};

type Session = { tradingDays: number; sessionHours: number };

export function sessionFor(type: SymbolType | undefined): Session {
  const table = sessions as unknown as Record<string, Session>;
  return table[type ?? "other"] ?? table.other;
}

export function barsPerYear(interval: Interval, type: SymbolType | undefined): number {
  const s = sessionFor(type);
  if (interval === "1D") return s.tradingDays;
  if (interval === "1W") return 52;
  if (interval === "1M") return 12;
  const sec = INTRADAY_SECONDS[interval] ?? 86400;
  return s.tradingDays * Math.ceil((s.sessionHours * 3600) / sec);
}
