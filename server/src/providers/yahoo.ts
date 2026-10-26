import type { Bar, CorporateEvent, Interval, Quote, SymbolInfo, SymbolType } from "@qt/core";
import { aggregateBars, INTERVAL_SEC, isIntraday, mergeStubs, validateBars } from "../bars";
import { fetchJson, notFound, nowSec, providerError, type BarOptions, type BarsPage, type FetchFn, type MarketProvider } from "./types";

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";

/** Upstream interval used to build each app interval (4h is aggregated from 60m). */
export const YAHOO_INTERVAL: Record<Interval, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "60m", "4h": "60m", "1D": "1d", "1W": "1wk", "1M": "1mo",
};

const DAY = 86400;
/** How far back intraday data is available upstream (with a safety margin). */
export const YAHOO_INTRADAY_LIMIT_SEC: Partial<Record<string, number>> = {
  "1m": 7 * DAY - 3600,
  "5m": 60 * DAY - 3600,
  "15m": 60 * DAY - 3600,
  "30m": 60 * DAY - 3600,
  "60m": 730 * DAY - 3600,
};

/** Calendar span per bar requested, relative to the nominal bar length (covers nights, weekends, holidays). */
const SPAN_FACTOR: Record<Interval, number> = {
  "1m": 5, "5m": 5, "15m": 5, "30m": 5, "1h": 5, "4h": 4.5, "1D": 1.6, "1W": 1.15, "1M": 1.1,
};

export interface YahooMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  firstTradeDate?: number | null;
  regularMarketTime?: number;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  gmtoffset?: number;
  exchangeTimezoneName?: string;
  currentTradingPeriod?: { regular?: { start?: number; end?: number; gmtoffset?: number } };
  longName?: string;
  shortName?: string;
}

const TYPE_MAP: Record<string, SymbolType> = {
  EQUITY: "stock",
  INDEX: "index",
  CURRENCY: "fx",
  CRYPTOCURRENCY: "crypto",
  ETF: "etf",
  FUTURE: "future",
  MUTUALFUND: "other",
};

export const yahooType = (t: string | undefined): SymbolType => (t && TYPE_MAP[t.toUpperCase()]) || "other";

const hhmm = (sec: number) => {
  const m = Math.round((((sec % DAY) + DAY) % DAY) / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
};

/** Regular session "HHMM-HHMM" in exchange-local time from the chart meta, when present. */
export function yahooSession(meta: YahooMeta): string | undefined {
  const r = meta.currentTradingPeriod?.regular;
  if (!r || typeof r.start !== "number" || typeof r.end !== "number" || !(r.end > r.start)) return undefined;
  const off = typeof r.gmtoffset === "number" ? r.gmtoffset : (meta.gmtoffset ?? 0);
  return `${hhmm(r.start + off)}-${hhmm(r.end + off)}`;
}

export function yahooInfo(meta: YahooMeta, ticker: string): SymbolInfo {
  const info: SymbolInfo = {
    symbol: ticker,
    name: meta.longName || meta.shortName || ticker,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    type: yahooType(meta.instrumentType),
    currency: meta.currency || "",
    provider: "yahoo",
  };
  if (meta.exchangeTimezoneName) info.timezone = meta.exchangeTimezoneName;
  const session = yahooSession(meta);
  if (session) info.session = session;
  return info;
}

interface ChartResult {
  meta: YahooMeta;
  timestamp?: number[];
  indicators?: {
    quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
  events?: {
    dividends?: Record<string, { amount?: number; date?: number }>;
    splits?: Record<string, { date?: number; numerator?: number; denominator?: number; splitRatio?: string }>;
    earnings?: Record<string, { date?: number; epsActual?: number; epsEstimate?: number }>;
  };
}

function chartResult(json: unknown, ticker: string): ChartResult {
  const chart = (json as { chart?: { result?: ChartResult[] | null; error?: { code?: string; description?: string } | null } })?.chart;
  const result = chart?.result?.[0];
  if (!result) {
    const desc = chart?.error?.description || chart?.error?.code || "empty response";
    if (/not found|delisted|no data/i.test(desc)) throw notFound(`Unknown symbol: ${ticker}`);
    throw providerError(`Yahoo: ${desc}`);
  }
  return result;
}

/**
 * Yahoo leaves the newest row's close (and sometimes high/low) null until it finalizes the bar,
 * while `meta` already carries the live price and the day's range. Fill the gaps of the LAST row
 * only, and only when the live quote time falls inside that row's bucket.
 */
function fillLiveLastRow(raw: Partial<Bar>[], ts: number[], meta: YahooMeta, interval: Interval): void {
  const i = raw.length - 1;
  const row = raw[i];
  const price = meta.regularMarketPrice;
  const at = meta.regularMarketTime;
  if (!row || typeof price !== "number" || !Number.isFinite(price) || typeof at !== "number") return;
  if (row.close !== undefined && row.high !== undefined && row.low !== undefined && row.open !== undefined) return;
  const bucket = isIntraday(interval) ? INTERVAL_SEC[interval] : interval === "1W" ? 7 * DAY : interval === "1M" ? 31 * DAY : DAY;
  if (at < ts[i] || at >= ts[i] + bucket) return;
  const daily = interval === "1D";
  row.close ??= price;
  row.open ??= row.close;
  const hi = daily && typeof meta.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : price;
  const lo = daily && typeof meta.regularMarketDayLow === "number" ? meta.regularMarketDayLow : price;
  row.high = Math.max(row.high ?? hi, hi, row.open, row.close);
  row.low = Math.min(row.low ?? lo, lo, row.open, row.close);
}

/**
 * Parse a Yahoo chart response into validated bars for the app interval.
 * Daily+ bars are re-stamped to UTC midnight of the exchange-local date; intraday closing-tick
 * stubs are merged into the previous bar; 4h is aggregated from 60m, anchored to the session.
 */
export function parseYahooChart(json: unknown, ticker: string, interval: Interval, opts: BarOptions = {}): { meta: YahooMeta; bars: Bar[] } {
  const r = chartResult(json, ticker);
  const meta = r.meta ?? {};
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const off = meta.gmtoffset ?? 0;
  const daily = !isIntraday(interval);
  // Dividend adjustment: scale OHLC by adjclose/close (Yahoo prices are already split-adjusted).
  const adj = opts.adjust === "dividends" && daily ? r.indicators?.adjclose?.[0]?.adjclose : undefined;
  const raw: Partial<Bar>[] = [];
  for (let i = 0; i < ts.length; i++) {
    let time = ts[i];
    if (daily) time = Math.floor((time + off) / DAY) * DAY;
    const row: Partial<Bar> = {
      time,
      open: q.open?.[i] ?? undefined,
      high: q.high?.[i] ?? undefined,
      low: q.low?.[i] ?? undefined,
      close: q.close?.[i] ?? undefined,
      volume: q.volume?.[i] ?? 0,
    };
    const a = adj?.[i];
    if (typeof a === "number" && Number.isFinite(a) && typeof row.close === "number" && row.close !== 0) {
      const f = a / row.close;
      if (row.open !== undefined) row.open *= f;
      if (row.high !== undefined) row.high *= f;
      if (row.low !== undefined) row.low *= f;
      row.close = a;
    }
    raw.push(row);
  }
  fillLiveLastRow(raw, ts, meta, interval);
  let bars = validateBars(raw);
  if (interval === "1W") bars = mergeStubs(bars, 6 * DAY);
  else if (interval === "1M") bars = mergeStubs(bars, 27 * DAY);
  else if (!daily) bars = mergeStubs(bars, interval === "4h" ? 3600 : INTERVAL_SEC[interval]);
  if (interval === "4h") bars = aggregateBars(bars, 14400, "session", off);
  return { meta, bars };
}

/**
 * Dividends, splits and (when Yahoo includes them) earnings dates from a chart response,
 * sorted by time. Times are UTC midnight of the exchange-local date, like daily bars.
 */
export function parseYahooEvents(json: unknown, ticker: string): CorporateEvent[] {
  const r = chartResult(json, ticker);
  const off = r.meta?.gmtoffset ?? 0;
  const day = (t: number) => Math.floor((t + off) / DAY) * DAY;
  const out: CorporateEvent[] = [];
  for (const d of Object.values(r.events?.dividends ?? {})) {
    if (typeof d.date === "number" && typeof d.amount === "number" && Number.isFinite(d.amount)) out.push({ time: day(d.date), kind: "dividend", value: d.amount });
  }
  for (const sp of Object.values(r.events?.splits ?? {})) {
    if (typeof sp.date !== "number") continue;
    const ratio =
      typeof sp.numerator === "number" && typeof sp.denominator === "number" && sp.denominator
        ? `${sp.numerator}:${sp.denominator}`
        : typeof sp.splitRatio === "string"
          ? sp.splitRatio.replace("/", ":")
          : "";
    if (ratio) out.push({ time: day(sp.date), kind: "split", value: ratio });
  }
  for (const e of Object.values(r.events?.earnings ?? {})) {
    if (typeof e.date === "number") out.push({ time: day(e.date), kind: "earnings", value: typeof e.epsActual === "number" ? e.epsActual : "" });
  }
  return out.sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));
}

export function parseYahooSearch(json: unknown): SymbolInfo[] {
  const quotes = (json as { quotes?: Record<string, unknown>[] })?.quotes ?? [];
  const out: SymbolInfo[] = [];
  for (const q of quotes) {
    const symbol = typeof q.symbol === "string" ? q.symbol : "";
    if (!symbol || typeof q.quoteType !== "string" || q.quoteType === "OPTION") continue;
    out.push({
      symbol: symbol.toUpperCase(),
      name: String(q.longname || q.shortname || symbol),
      exchange: String(q.exchDisp || q.exchange || ""),
      type: yahooType(q.quoteType),
      currency: "",
      provider: "yahoo",
    });
  }
  return out;
}

export function parseYahooQuote(json: unknown, ticker: string): Quote {
  const meta = chartResult(json, ticker).meta ?? {};
  const last = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  if (typeof last !== "number" || !Number.isFinite(last)) throw providerError(`Yahoo: no price for ${ticker}`);
  const change = typeof prev === "number" && prev ? last - prev : 0;
  return {
    symbol: ticker,
    last,
    change,
    changePct: typeof prev === "number" && prev ? (change / prev) * 100 : 0,
    time: meta.regularMarketTime ?? nowSec(),
  };
}

export class YahooProvider implements MarketProvider {
  constructor(
    private readonly fetchFn: FetchFn,
    private readonly now: () => number = nowSec,
  ) {}

  /** Raw chart call. Returns null when Yahoo rejects the requested range (HTTP 422). */
  private async chart(ticker: string, query: string, extra: { prePost?: boolean; events?: string; adjclose?: boolean } = {}): Promise<unknown | null> {
    let url = `${CHART_URL}${encodeURIComponent(ticker)}?${query}&includePrePost=${extra.prePost ? "true" : "false"}&events=${extra.events ?? ""}`;
    if (extra.adjclose) url += "&includeAdjustedClose=true";
    const { status, body } = await fetchJson(this.fetchFn, url, "Yahoo");
    if (status === 404) chartResult(body, ticker); // throws not_found (or provider error)
    if (status === 422) return null;
    if (status === 429) throw providerError("Yahoo rate limit reached; try again shortly");
    if (status >= 400) {
      chartResult(body, ticker);
      throw providerError(`Yahoo HTTP ${status}`);
    }
    return body;
  }

  async bars(ticker: string, interval: Interval, to: number | undefined, limit: number, opts: BarOptions = {}): Promise<BarsPage> {
    const yInterval = YAHOO_INTERVAL[interval];
    const extra = { prePost: opts.session === "extended" && isIntraday(interval), adjclose: opts.adjust === "dividends" && !isIntraday(interval) };
    const now = this.now();
    const end = to ?? now + DAY;
    const windowLimit = YAHOO_INTRADAY_LIMIT_SEC[yInterval];
    const earliest = windowLimit ? now - windowLimit : -Infinity;
    const stepSec = INTERVAL_SEC[interval];
    let span = limit * stepSec * SPAN_FACTOR[interval] + 3 * DAY;
    let floor = -2208988800; // 1900-01-01 until the provider tells us the first trade date
    let info: SymbolInfo | undefined;
    let bars: Bar[] = [];
    let exhausted = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      let start = Math.max(end - span, earliest, floor);
      if (start >= end) {
        exhausted = true;
        break;
      }
      // Align to a day boundary so sessions (and 4h buckets) are not cut in half.
      if (start > earliest + DAY) start = Math.floor(start / DAY) * DAY;
      const json = await this.chart(ticker, `interval=${yInterval}&period1=${Math.floor(start)}&period2=${Math.floor(end)}`, extra);
      if (json === null) {
        exhausted = true;
        break;
      }
      const parsed = parseYahooChart(json, ticker, interval, opts);
      info = yahooInfo(parsed.meta, ticker);
      if (typeof parsed.meta.firstTradeDate === "number") floor = parsed.meta.firstTradeDate;
      bars = to === undefined ? parsed.bars : parsed.bars.filter((b) => b.time < to);
      exhausted = start <= earliest || start <= floor;
      if (bars.length > limit || exhausted) break;
      span *= 3;
    }
    if (!info) {
      // Range lies entirely outside what the provider serves: fetch metadata cheaply.
      const json = await this.chart(ticker, "interval=1d&range=1d");
      info = yahooInfo(json ? chartResult(json, ticker).meta : {}, ticker);
    }
    // When not exhausted the oldest bucket may be partial (window cut); it is dropped by the slice.
    const hasMore = !exhausted || bars.length > limit;
    return { info, bars: bars.slice(Math.max(0, bars.length - limit)), hasMore };
  }

  /** Corporate events over the full history (monthly bars keep the response small). */
  async events(ticker: string): Promise<CorporateEvent[]> {
    const json = await this.chart(ticker, "interval=1mo&range=max", { events: "div,splits,earn" });
    if (json === null) return [];
    return parseYahooEvents(json, ticker);
  }

  async search(q: string): Promise<SymbolInfo[]> {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`;
    const { status, body } = await fetchJson(this.fetchFn, url, "Yahoo search");
    if (status >= 400) throw providerError(`Yahoo search HTTP ${status}`);
    return parseYahooSearch(body);
  }

  async quote(ticker: string): Promise<Quote> {
    const json = await this.chart(ticker, "interval=1d&range=1d");
    if (json === null) throw providerError(`Yahoo: no quote for ${ticker}`);
    return parseYahooQuote(json, ticker);
  }

  async quotes(tickers: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    const queue = [...tickers];
    const worker = async () => {
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
        try {
          out.push(await this.quote(t));
        } catch {
          // Per-symbol failures are omitted so one bad symbol never fails the batch.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, tickers.length) }, worker));
    return out;
  }
}
