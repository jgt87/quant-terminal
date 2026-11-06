import path from "node:path";
import type { Bar, BarFlow, FlowTrade, Interval, Quote, SymbolInfo } from "@qt/core";
import { validateBars } from "../bars";
import { readJson, writeJsonAtomic } from "../fsutil";
import { fetchJson, notFound, nowSec, providerError, type BarsPage, type FetchFn, type MarketProvider } from "./types";

const API = "https://api.binance.com/api/v3";
const PAGE = 1000;
const DAY_MS = 86_400_000;

export const BINANCE_INTERVAL: Record<Interval, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w", "1M": "1M",
};

/** Quote assets recognised when splitting a bare pair such as BTCUSDT. */
export const QUOTE_ASSETS = ["USDT", "USDC", "BUSD", "FDUSD", "BTC", "ETH", "BNB", "EUR", "TRY"];

export interface PairInfo {
  symbol: string;
  base: string;
  quote: string;
}

export function parseKlines(json: unknown): Bar[] {
  if (!Array.isArray(json)) throw providerError("Binance: unexpected klines payload");
  return validateBars(
    json.map((k: unknown[]) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    })),
  );
}

/** aggTrades rows ({a, p, q, T, m}) → trades; `m` (buyer is maker) means the aggressor sold. */
export function parseAggTrades(json: unknown): FlowTrade[] {
  if (!Array.isArray(json)) throw providerError("Binance: unexpected aggTrades payload");
  return json
    .map((r: Record<string, unknown>) => ({ id: Number(r.a), time: Number(r.T), price: Number(r.p), qty: Number(r.q), buy: r.m === false }))
    .filter((t) => Number.isFinite(t.id) && Number.isFinite(t.time) && Number.isFinite(t.price) && t.qty > 0);
}

/** Klines → taker buy / sell volume per bar (field 9 is the taker-buy base volume). */
export function parseKlineFlow(json: unknown): BarFlow[] {
  if (!Array.isArray(json)) throw providerError("Binance: unexpected klines payload");
  return json
    .map((k: unknown[]) => {
      const vol = Number(k[5]);
      const buy = Number(k[9]);
      return { time: Math.floor(Number(k[0]) / 1000), buy, sell: Math.max(0, vol - buy) };
    })
    .filter((f) => Number.isFinite(f.time) && Number.isFinite(f.buy) && Number.isFinite(f.sell));
}

export function parseExchangeInfo(json: unknown): PairInfo[] {
  const symbols = (json as { symbols?: Record<string, unknown>[] })?.symbols;
  if (!Array.isArray(symbols)) throw providerError("Binance: unexpected exchangeInfo payload");
  return symbols
    .filter((s) => s.status === undefined || s.status === "TRADING")
    .map((s) => ({ symbol: String(s.symbol), base: String(s.baseAsset), quote: String(s.quoteAsset) }));
}

export function parseTicker(row: Record<string, unknown>): Quote {
  const last = Number(row.lastPrice);
  const open = Number(row.openPrice);
  const change = Number(row.priceChange);
  return {
    symbol: `BINANCE:${row.symbol}`,
    last,
    change: Number.isFinite(change) ? change : last - open,
    changePct: Number(row.priceChangePercent) || 0,
    time: Math.floor(Number(row.closeTime) / 1000) || nowSec(),
  };
}

/** Split a bare pair into base/quote by known quote suffixes. */
export function splitPair(symbol: string): PairInfo {
  const quote = QUOTE_ASSETS.find((q) => symbol.endsWith(q) && symbol.length > q.length) ?? "";
  return { symbol, base: quote ? symbol.slice(0, -quote.length) : symbol, quote };
}

export function binanceInfo(pair: PairInfo): SymbolInfo {
  return {
    symbol: `BINANCE:${pair.symbol}`,
    name: pair.quote ? `${pair.base} / ${pair.quote}` : pair.symbol,
    exchange: "Binance",
    type: "crypto",
    currency: pair.quote,
    provider: "binance",
  };
}

function binanceError(status: number, body: unknown, what: string): never {
  const code = (body as { code?: number })?.code;
  const msg = (body as { msg?: string })?.msg;
  if (code === -1121) throw notFound(`Unknown symbol: ${what}`);
  if (status === 429 || status === 418) throw providerError("Binance rate limit reached; try again shortly");
  if (status === 451 || status === 403) throw providerError("Binance is not reachable from this location");
  throw providerError(`Binance HTTP ${status}${msg ? `: ${msg}` : ""}`);
}

export class BinanceProvider implements MarketProvider {
  private pairs: Map<string, PairInfo> | null = null;
  private pairsAt = 0;
  private pairsLoading: Promise<Map<string, PairInfo>> | null = null;

  constructor(
    private readonly fetchFn: FetchFn,
    /** Directory for the persisted exchangeInfo digest; omit to keep it in memory only. */
    private readonly cacheDir?: string,
  ) {}

  /** Known trading pairs, from exchangeInfo, refreshed once a day. */
  async loadPairs(): Promise<Map<string, PairInfo>> {
    if (this.pairs && Date.now() - this.pairsAt < DAY_MS) return this.pairs;
    this.pairsLoading ??= this.fetchPairs().finally(() => (this.pairsLoading = null));
    return this.pairsLoading;
  }

  /** Synchronous view of the pair table (null until loaded once). */
  knownPairs(): Map<string, PairInfo> | null {
    return this.pairs;
  }

  private async fetchPairs(): Promise<Map<string, PairInfo>> {
    const file = this.cacheDir ? path.join(this.cacheDir, "binance-pairs.json") : undefined;
    if (file && !this.pairs) {
      const disk = await readJson<{ at: number; pairs: PairInfo[] }>(file).catch(() => undefined);
      if (disk && Date.now() - disk.at < DAY_MS) {
        this.setPairs(disk.pairs, disk.at);
        return this.pairs!;
      }
    }
    try {
      const { status, body } = await fetchJson(this.fetchFn, `${API}/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false`, "Binance");
      if (status >= 400) binanceError(status, body, "exchangeInfo");
      const list = parseExchangeInfo(body);
      this.setPairs(list, Date.now());
      if (file) await writeJsonAtomic(file, { at: this.pairsAt, pairs: list }).catch(() => {});
      return this.pairs!;
    } catch (err) {
      if (this.pairs) return this.pairs; // keep serving the stale table
      throw err;
    }
  }

  private setPairs(list: PairInfo[], at: number) {
    this.pairs = new Map(list.map((p) => [p.symbol, p]));
    this.pairsAt = at;
  }

  info(ticker: string): SymbolInfo {
    return binanceInfo(this.pairs?.get(ticker) ?? splitPair(ticker));
  }

  async bars(ticker: string, interval: Interval, to: number | undefined, limit: number): Promise<BarsPage> {
    let endTime = to !== undefined ? to * 1000 - 1 : undefined;
    let bars: Bar[] = [];
    let exhausted = false;
    while (bars.length < limit) {
      const n = Math.min(PAGE, limit - bars.length);
      let url = `${API}/klines?symbol=${encodeURIComponent(ticker)}&interval=${BINANCE_INTERVAL[interval]}&limit=${n}`;
      if (endTime !== undefined) url += `&endTime=${endTime}`;
      const { status, body } = await fetchJson(this.fetchFn, url, "Binance");
      if (status >= 400) binanceError(status, body, `BINANCE:${ticker}`);
      const page = parseKlines(body);
      if (page.length === 0) {
        exhausted = true;
        break;
      }
      bars = validateBars([...page, ...bars]);
      if (page.length < n) {
        exhausted = true;
        break;
      }
      endTime = page[0].time * 1000 - 1;
    }
    if (to !== undefined) bars = bars.filter((b) => b.time < to);
    return { info: this.info(ticker), bars: bars.slice(Math.max(0, bars.length - limit)), hasMore: !exhausted };
  }

  /** Taker buy / sell volume per bar for bars opening in [fromSec, toSec), oldest first (max `limit`). */
  async barFlow(ticker: string, interval: Interval, fromSec: number, toSec: number, limit = 5000): Promise<BarFlow[]> {
    const out: BarFlow[] = [];
    let start = fromSec * 1000;
    while (out.length < limit && start < toSec * 1000) {
      const n = Math.min(PAGE, limit - out.length);
      const url = `${API}/klines?symbol=${encodeURIComponent(ticker)}&interval=${BINANCE_INTERVAL[interval]}&startTime=${start}&endTime=${toSec * 1000 - 1}&limit=${n}`;
      const { status, body } = await fetchJson(this.fetchFn, url, "Binance");
      if (status >= 400) binanceError(status, body, `BINANCE:${ticker}`);
      const page = parseKlineFlow(body);
      if (!page.length) break;
      out.push(...page);
      if (page.length < n) break;
      start = (page[page.length - 1].time + 1) * 1000;
    }
    return out.filter((f) => f.time >= fromSec && f.time < toSec);
  }

  /**
   * Trades in [fromMs, toMs), oldest first, at most `maxPages` requests of 1000. The first page is
   * found by time (Binance allows a one-hour window per request), the rest follow by trade id.
   * `complete` is false when the page cap stopped the walk before `toMs`.
   */
  async aggTrades(ticker: string, fromMs: number, toMs: number, maxPages = 40): Promise<{ trades: FlowTrade[]; complete: boolean }> {
    const sym = encodeURIComponent(ticker);
    const get = async (query: string) => {
      const { status, body } = await fetchJson(this.fetchFn, `${API}/aggTrades?symbol=${sym}&limit=${PAGE}&${query}`, "Binance");
      if (status >= 400) binanceError(status, body, `BINANCE:${ticker}`);
      return parseAggTrades(body);
    };
    const trades: FlowTrade[] = [];
    let pages = 0;
    let page: FlowTrade[] = [];
    // Find the first trade: one-hour windows forward from `fromMs`.
    let start = fromMs;
    for (; start < toMs && pages < maxPages; start += 3_600_000) {
      page = await get(`startTime=${start}&endTime=${Math.min(start + 3_600_000, toMs) - 1}`);
      pages++;
      if (page.length) break;
    }
    if (!page.length) return { trades, complete: start >= toMs };
    // A window page can be short because of its end time; pages by id end at the newest trade.
    let byId = false;
    while (page.length) {
      for (const t of page) if (t.time >= fromMs && t.time < toMs) trades.push(t);
      const last = page[page.length - 1];
      if (last.time >= toMs || (byId && page.length < PAGE)) return { trades, complete: true };
      if (pages >= maxPages) return { trades, complete: false };
      page = await get(`fromId=${last.id + 1}`);
      pages++;
      byId = true;
    }
    return { trades, complete: true };
  }

  /** The most recent trades (newest last), at most 1000. */
  async recentTrades(ticker: string, limit: number): Promise<FlowTrade[]> {
    const url = `${API}/aggTrades?symbol=${encodeURIComponent(ticker)}&limit=${Math.max(1, Math.min(PAGE, limit))}`;
    const { status, body } = await fetchJson(this.fetchFn, url, "Binance");
    if (status >= 400) binanceError(status, body, `BINANCE:${ticker}`);
    return parseAggTrades(body);
  }

  async search(q: string): Promise<SymbolInfo[]> {
    const pairs = await this.loadPairs();
    const needle = q.toUpperCase().replace(/^BINANCE:/, "").replace(/[^A-Z0-9]/g, "");
    if (!needle) return [];
    const scored: { p: PairInfo; score: number }[] = [];
    for (const p of pairs.values()) {
      let score = 0;
      if (p.symbol === needle) score = 100;
      else if (p.quote !== "USDT") continue;
      else if (p.base === needle) score = 90;
      else if (p.symbol.startsWith(needle)) score = 60;
      else if (p.base.startsWith(needle)) score = 50;
      else continue;
      scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score || a.p.symbol.length - b.p.symbol.length || a.p.symbol.localeCompare(b.p.symbol));
    return scored.slice(0, 10).map((s) => binanceInfo(s.p));
  }

  async quotes(tickers: string[]): Promise<Quote[]> {
    if (tickers.length === 0) return [];
    const batch = async (list: string[]) => {
      const url = `${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(list))}`;
      const { status, body } = await fetchJson(this.fetchFn, url, "Binance");
      if (status >= 400) binanceError(status, body, list.join(","));
      if (!Array.isArray(body)) throw providerError("Binance: unexpected ticker payload");
      return body.map((r) => parseTicker(r as Record<string, unknown>));
    };
    try {
      return await batch(tickers);
    } catch (err) {
      if (tickers.length === 1) return [];
      // One invalid symbol fails the whole upstream batch: retry one by one, omitting failures.
      const results = await Promise.allSettled(tickers.map((t) => batch([t])));
      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    }
  }
}
