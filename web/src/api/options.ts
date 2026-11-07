// Options API (Binance options, public market data).

import type { OptionChain } from "@qt/core";
import { requestJson } from "./http";

export const fetchOptionUnderlyings = () => requestJson<{ underlyings: { underlying: string; symbol: string }[] }>("/api/options/underlyings");

/** Chain of one expiry (UTC ms; the nearest when omitted). */
export const fetchOptionChain = (symbol: string, expiry?: number) =>
  requestJson<OptionChain>(`/api/options/chain?${new URLSearchParams({ symbol, ...(expiry !== undefined ? { expiry: String(expiry) } : {}) }).toString()}`);
