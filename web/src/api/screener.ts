// Screener REST API.

import type { ScreenerRequest, ScreenerRow } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export interface UniverseInfo {
  id: string;
  name: string;
  description?: string;
  asOf?: string;
  count: number;
  symbols: string[];
}

export interface ScreenerResult {
  rows: ScreenerRow[];
  computedAt: number;
  errors: { symbol: string; message: string }[];
}

export const listUniverses = () => requestJson<UniverseInfo[]>("/api/screener/universes");
export const runScreener = (req: ScreenerRequest, signal?: AbortSignal) =>
  requestJson<ScreenerResult>("/api/screener", { ...jsonBody("POST", req), signal });
