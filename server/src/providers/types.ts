import type { Bar, Interval, Quote, SymbolInfo } from "@qt/core";
import { HttpError, notFound, providerError } from "../errors";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Result of one provider bars request. */
export interface BarsPage {
  info: SymbolInfo;
  bars: Bar[];
  hasMore: boolean;
  /** Provider limits to tell the user about (see BarsResponse.notices). */
  notices?: string[];
}

/** Optional bar variants (Yahoo only; other providers ignore them). */
export interface BarOptions {
  /** Scale OHLC by adjclose/close (daily and longer intervals). */
  adjust?: "dividends";
  /** Include pre/post-market bars (intraday intervals). */
  session?: "extended";
}

export interface MarketProvider {
  bars(ticker: string, interval: Interval, to: number | undefined, limit: number, opts?: BarOptions): Promise<BarsPage>;
  search(q: string): Promise<SymbolInfo[]>;
  quotes(tickers: string[]): Promise<Quote[]>;
}

/** Generic desktop browser UA; some upstreams reject requests without one. */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export interface JsonResponse {
  status: number;
  body: unknown;
}

/** GET a URL and parse JSON. Network failures and non-JSON bodies become 502 provider errors. */
export async function fetchJson(fetchFn: FetchFn, url: string, label: string): Promise<JsonResponse> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw providerError(`${label} request failed: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw providerError(`${label} returned a non-JSON response (HTTP ${res.status})`);
  }
  return { status: res.status, body };
}

export const nowSec = () => Math.floor(Date.now() / 1000);

export { HttpError, notFound, providerError };
