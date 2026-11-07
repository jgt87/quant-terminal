import type { BarsResponse, CorporateEvent, Interval, Provider, Quote, SymbolInfo } from "@qt/core";
import { DiskCache } from "../cache";
import { HttpError, badRequest, providerError } from "../errors";
import { INTERVAL_SEC, isIntraday } from "../bars";
import { BinanceProvider } from "./binance";
import { BinanceOptions } from "./binanceOptions";
import { MT5_PREFIX, Mt5Provider } from "./mt5";
import { YahooProvider } from "./yahoo";
import { nowSec, type BarOptions, type BarsPage, type FetchFn } from "./types";

export type { BarOptions };

export interface SymbolRoute {
  provider: Provider;
  /** Ticker as the provider expects it (e.g. "^NDX", "BTCUSDT"). */
  ticker: string;
  /** Canonical app id (SymbolInfo.symbol), e.g. "^NDX", "BINANCE:BTCUSDT". */
  canonical: string;
}

/** Common index names → Yahoo tickers. */
export const INDEX_ALIASES: Record<string, string> = {
  NDX: "^NDX",
  NDQ: "^NDX",
  SPX: "^GSPC",
  SPX500: "^GSPC",
  GSPC: "^GSPC",
  DJI: "^DJI",
  DJIA: "^DJI",
  VIX: "^VIX",
  RUT: "^RUT",
  IXIC: "^IXIC",
};

const FX_PREFIXES = new Set(["FX", "FX_IDC", "OANDA", "FXCM", "SAXO"]);
const CRYPTO_SUFFIX = /^[A-Z0-9]{2,}(USDT|USDC|BUSD|BTC|ETH)$/;
const STABLE_SUFFIX = /^[A-Z0-9]{2,}(USDT|USDC|BUSD)$/;
const VALID = /^(?!.*\.\.)[A-Z0-9^=.\-_]{1,32}$/;

/**
 * Map a user/app symbol to a provider + ticker.
 * - `MT5:XXX` → local MetaTrader 5 bridge. With `fxProvider: "mt5"`, FX pairs (`FX:EURUSD`,
 *   `OANDA:EURUSD`, `EURUSD=X`) are routed to MT5 as well.
 * - `BINANCE:XXX` → Binance.
 * - Bare pair ending in USDT/USDC/BUSD/BTC/ETH that Binance lists → Binance. When the pair
 *   table is not loaded yet, stablecoin pairs go to Binance and BTC/ETH-quoted ones to Yahoo.
 * - `EXCHANGE:TICKER` → Yahoo with the prefix stripped (index aliases and FX pairs mapped).
 * - Anything else → Yahoo as-is.
 */
export function routeSymbol(
  raw: string,
  binancePairs: ReadonlySet<string> | ReadonlyMap<string, unknown> | null,
  fxProvider: "yahoo" | "mt5" = "yahoo",
): SymbolRoute {
  const s = raw.trim().toUpperCase();
  if (!s) throw badRequest("Missing symbol");
  const fx = (pair: string): SymbolRoute => (fxProvider === "mt5" ? mt5(pair) : yahoo(`${pair}=X`));
  if (/^[A-Z]{6}=X$/.test(s)) return fx(s.slice(0, 6));
  const colon = s.indexOf(":");
  if (colon >= 0) {
    const prefix = s.slice(0, colon);
    const name = s.slice(colon + 1);
    if (!name || !VALID.test(name)) throw badRequest(`Invalid symbol: ${raw}`);
    if (prefix === "BINANCE") return { provider: "binance", ticker: name, canonical: `BINANCE:${name}` };
    if (prefix === "MT5") return mt5(name);
    if (FX_PREFIXES.has(prefix) && /^[A-Z]{6}$/.test(name)) return fx(name);
    return yahoo(INDEX_ALIASES[name] ?? name);
  }
  if (!VALID.test(s)) throw badRequest(`Invalid symbol: ${raw}`);
  if (CRYPTO_SUFFIX.test(s)) {
    const known = binancePairs ? binancePairs.has(s) : STABLE_SUFFIX.test(s);
    if (known) return { provider: "binance", ticker: s, canonical: `BINANCE:${s}` };
  }
  return yahoo(INDEX_ALIASES[s] ?? s);
}

const yahoo = (ticker: string): SymbolRoute => ({ provider: "yahoo", ticker, canonical: ticker });
const mt5 = (ticker: string): SymbolRoute => ({ provider: "mt5", ticker, canonical: `${MT5_PREFIX}${ticker}` });

export interface MarketDataOptions {
  fetchFn?: FetchFn;
  /** Disk cache directory; undefined = memory only. */
  cacheDir?: string;
  now?: () => number;
  /** Route FX pairs to the local MT5 bridge instead of Yahoo (env QT_FX_PROVIDER=mt5). */
  fxProvider?: "yahoo" | "mt5";
  mt5BridgeUrl?: string;
}

const HISTORICAL_TTL = 7 * 86400;

/** Cache TTL (seconds) for a bars page. */
export function barsTtl(interval: Interval, to: number | undefined, now: number, live = false): number {
  const latest = to === undefined || to > now - INTERVAL_SEC[interval];
  if (!latest) return HISTORICAL_TTL;
  if (live) return 1; // local live feed: cache only to coalesce bursts
  return isIntraday(interval) ? 30 : 15 * 60;
}

/** Cache-key suffix for bar options that change the result for this interval ("" when none). */
export function barOptionsKey(opts: BarOptions, interval: Interval): string {
  let k = "";
  if (opts.adjust === "dividends" && !isIntraday(interval)) k += ":adj";
  if (opts.session === "extended" && isIntraday(interval)) k += ":ext";
  return k;
}

/** Provider routing + caching facade used by the routes. */
export class MarketData {
  readonly yahoo: YahooProvider;
  readonly binance: BinanceProvider;
  readonly mt5: Mt5Provider;
  /** Binance options (public market data). */
  readonly options: BinanceOptions;
  readonly fxProvider: "yahoo" | "mt5";
  private readonly barsCache: DiskCache<BarsPage>;
  private readonly quoteCache: DiskCache<Quote[]>;
  private readonly eventsCache: DiskCache<CorporateEvent[]>;
  private readonly now: () => number;

  constructor(opts: MarketDataOptions = {}) {
    const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = opts.now ?? nowSec;
    this.yahoo = new YahooProvider(fetchFn, this.now);
    this.binance = new BinanceProvider(fetchFn, opts.cacheDir);
    this.mt5 = new Mt5Provider(fetchFn, opts.mt5BridgeUrl);
    this.options = new BinanceOptions(fetchFn);
    this.fxProvider = opts.fxProvider ?? "yahoo";
    this.barsCache = new DiskCache<BarsPage>(opts.cacheDir, 300);
    this.quoteCache = new DiskCache<Quote[]>(undefined, 500);
    this.eventsCache = new DiskCache<CorporateEvent[]>(opts.cacheDir, 200);
  }

  /** Route a symbol; loads the Binance pair table when it matters (failures fall back to heuristics). */
  async resolve(raw: string): Promise<SymbolRoute> {
    const s = raw.trim().toUpperCase();
    if (!s.includes(":") && CRYPTO_SUFFIX.test(s)) {
      const pairs = await this.binance.loadPairs().catch(() => null);
      return routeSymbol(s, pairs, this.fxProvider);
    }
    return routeSymbol(s, this.binance.knownPairs(), this.fxProvider);
  }

  async bars(raw: string, interval: Interval, to: number | undefined, limit: number, opts: BarOptions = {}): Promise<BarsResponse> {
    const route = await this.resolve(raw);
    // Bar options only apply to Yahoo; they extend the key so plain requests keep their cache entries.
    const o = route.provider === "yahoo" ? barOptionsKey(opts, interval) : "";
    const key = `${route.provider}:${route.ticker}:${interval}:${to ?? "latest"}:${limit}${o}`;
    const provider = route.provider === "binance" ? this.binance : route.provider === "mt5" ? this.mt5 : this.yahoo;
    const page = await this.barsCache.getOrFetch(
      key,
      () => barsTtl(interval, to, this.now(), route.provider === "mt5"),
      () => provider.bars(route.ticker, interval, to, limit, route.provider === "yahoo" ? opts : undefined),
      (err) => !(err instanceof HttpError) || err.status >= 500,
    );
    return { symbol: { ...page.info, symbol: route.canonical }, interval, bars: page.bars, hasMore: page.hasMore };
  }

  /** Dividends/splits (and earnings when available) for a symbol; non-Yahoo symbols have none. */
  async events(raw: string): Promise<CorporateEvent[]> {
    const route = await this.resolve(raw);
    if (route.provider !== "yahoo") return [];
    return this.eventsCache.getOrFetch(
      `events:${route.ticker}`,
      () => 12 * 3600,
      () => this.yahoo.events(route.ticker),
      (err) => !(err instanceof HttpError) || err.status >= 500,
    );
  }

  async search(q: string): Promise<SymbolInfo[]> {
    const [y, b, m] = await Promise.allSettled([this.yahoo.search(q), this.binance.search(q), this.mt5.search(q)]);
    if (y.status === "rejected" && b.status === "rejected") throw y.reason instanceof HttpError ? y.reason : providerError("Search failed");
    const ys = y.status === "fulfilled" ? y.value : [];
    const bs = b.status === "fulfilled" ? b.value : [];
    const ms = m.status === "fulfilled" ? m.value : [];
    const needle = q.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Exact Binance base/pair matches (e.g. "btc") lead; then Yahoo; then the rest of Binance.
    const lead = [
      ...ms.filter((s) => s.symbol.slice(MT5_PREFIX.length).replace(/[^A-Z0-9]/gi, "").toUpperCase() === needle),
      ...bs.filter((s) => {
        const t = s.symbol.slice(8);
        return t === needle || t === `${needle}USDT`;
      }),
    ];
    const merged: SymbolInfo[] = [];
    const seen = new Set<string>();
    for (const s of [...lead, ...ys, ...ms, ...bs]) {
      if (seen.has(s.symbol)) continue;
      seen.add(s.symbol);
      merged.push(s);
      if (merged.length >= 20) break;
    }
    return merged;
  }

  /** Quotes for app symbols; failing symbols are omitted. Results keep the requested order. */
  async quotes(raws: string[]): Promise<Quote[]> {
    const routes = await Promise.all(raws.map((r) => this.resolve(r).catch(() => null)));
    const valid = routes.filter((r): r is SymbolRoute => r !== null);
    const yTickers = [...new Set(valid.filter((r) => r.provider === "yahoo").map((r) => r.ticker))];
    const bTickers = [...new Set(valid.filter((r) => r.provider === "binance").map((r) => r.ticker))];
    const mTickers = [...new Set(valid.filter((r) => r.provider === "mt5").map((r) => r.ticker))];
    const cached = (prov: string, tickers: string[], fn: () => Promise<Quote[]>) =>
      tickers.length ? this.quoteCache.getOrFetch(`${prov}:${tickers.join(",")}`, () => 10, fn).catch(() => []) : Promise.resolve([]);
    const [yq, bq, mq] = await Promise.all([
      cached("yahoo", yTickers, () => this.yahoo.quotes(yTickers)),
      cached("binance", bTickers, () => this.binance.quotes(bTickers)),
      mTickers.length ? this.mt5.quotes(mTickers).catch(() => []) : Promise.resolve([]),
    ]);
    const bySymbol = new Map<string, Quote>();
    for (const q of yq) bySymbol.set(q.symbol, q);
    for (const q of bq) bySymbol.set(q.symbol, q);
    for (const q of mq) bySymbol.set(q.symbol, q);
    const out: Quote[] = [];
    raws.forEach((raw, i) => {
      const r = routes[i];
      const q = r && bySymbol.get(r.canonical);
      if (q) out.push({ ...q, symbol: raw.trim() || r.canonical });
    });
    return out;
  }
}
