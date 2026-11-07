// Binance options (public market data, no key): the option symbols per underlying, 24 h tickers,
// mark prices with implied volatility and greeks, open interest per expiry and the underlying's
// index price. Responses are cached briefly; the chain for one expiry is assembled from them.

import { atmIv, chainRows, expiryCode, parseOptionSymbol, type OptionChain, type OptionExpiry, type OptionQuote } from "@qt/core";
import { badRequest, notFound } from "../errors";
import { fetchJson, providerError, type FetchFn } from "./types";

const API = "https://eapi.binance.com/eapi/v1";
const INFO_MS = 3600_000;
const QUOTE_MS = 15_000;
const OI_MS = 60_000;

interface OptionSymbolInfo {
  symbol: string;
  underlying: string;
  expiry: number;
  strike: number;
  side: "call" | "put";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

export function parseOptionInfo(json: unknown): OptionSymbolInfo[] {
  const list = (json as { optionSymbols?: unknown[] } | null)?.optionSymbols;
  if (!Array.isArray(list)) throw providerError("Binance options: unexpected exchangeInfo payload");
  const out: OptionSymbolInfo[] = [];
  for (const raw of list) {
    const r = raw as Record<string, unknown>;
    const symbol = String(r.symbol ?? "");
    const p = parseOptionSymbol(symbol);
    const expiry = num(r.expiryDate);
    if (!p || expiry === null || typeof r.underlying !== "string") continue;
    out.push({ symbol, underlying: r.underlying, expiry, strike: p.strike, side: p.side });
  }
  return out;
}

interface Cached<T> {
  at: number;
  value: Promise<T>;
}

export class BinanceOptions {
  private info: Cached<OptionSymbolInfo[]> | null = null;
  private tickers: Cached<Map<string, Record<string, unknown>>> | null = null;
  private marks: Cached<Map<string, Record<string, unknown>>> | null = null;
  private readonly oi = new Map<string, Cached<Map<string, number>>>();

  constructor(
    private readonly fetchFn: FetchFn,
    private readonly now: () => number = Date.now,
  ) {}

  private async get(path: string): Promise<unknown> {
    const { status, body } = await fetchJson(this.fetchFn, `${API}${path}`, "Binance options");
    if (status >= 400) throw providerError(`Binance options HTTP ${status}`);
    return body;
  }

  private cached<T>(slot: Cached<T> | null, ms: number, load: () => Promise<T>, set: (c: Cached<T>) => void): Promise<T> {
    if (slot && this.now() - slot.at < ms) return slot.value;
    const value = load();
    const c = { at: this.now(), value };
    set(c);
    // A failed load is not kept: the next call loads again.
    value.catch(() => {
      c.at = 0;
    });
    return value;
  }

  private symbols(): Promise<OptionSymbolInfo[]> {
    return this.cached(this.info, INFO_MS, async () => parseOptionInfo(await this.get("/exchangeInfo")), (c) => (this.info = c));
  }

  private bySymbol(path: string): Promise<Map<string, Record<string, unknown>>> {
    return (async () => {
      const body = await this.get(path);
      if (!Array.isArray(body)) throw providerError(`Binance options: unexpected ${path} payload`);
      return new Map(body.map((r) => [String((r as Record<string, unknown>).symbol), r as Record<string, unknown>]));
    })();
  }

  private openInterest(base: string, code: string): Promise<Map<string, number>> {
    const key = `${base}|${code}`;
    return this.cached(
      this.oi.get(key) ?? null,
      OI_MS,
      async () => {
        const body = await this.get(`/openInterest?underlyingAsset=${encodeURIComponent(base)}&expiration=${code}`);
        const m = new Map<string, number>();
        if (Array.isArray(body)) for (const r of body as Record<string, unknown>[]) m.set(String(r.symbol), num(r.sumOpenInterest) ?? 0);
        return m;
      },
      (c) => this.oi.set(key, c),
    );
  }

  /** Underlyings with listed options (pairs such as BTCUSDT). */
  async underlyings(): Promise<string[]> {
    return [...new Set((await this.symbols()).map((s) => s.underlying))].sort();
  }

  /**
   * The chain of `underlying` (a pair, e.g. BTCUSDT) for one expiry (UTC ms; the nearest one
   * when omitted), with the at-the-money IV of every expiry for the term structure.
   */
  async chain(underlying: string, expiry?: number): Promise<OptionChain> {
    const all = (await this.symbols()).filter((s) => s.underlying === underlying);
    if (!all.length) throw notFound(`No listed options for ${underlying}`);
    const times = [...new Set(all.map((s) => s.expiry))].sort((a, b) => a - b);
    const expiries: OptionExpiry[] = times.map((time) => ({ time, code: expiryCode(time) }));
    let chosen = expiry === undefined ? expiries[0] : expiries.find((e) => e.time === expiry);
    if (!chosen) throw badRequest("Unknown expiry for this underlying");
    const [tickers, marks, indexBody] = await Promise.all([
      this.cached(this.tickers, QUOTE_MS, () => this.bySymbol("/ticker"), (c) => (this.tickers = c)),
      this.cached(this.marks, QUOTE_MS, () => this.bySymbol("/mark"), (c) => (this.marks = c)),
      this.get(`/index?underlying=${encodeURIComponent(underlying)}`).catch(() => null),
    ]);
    const base = parseOptionSymbol(all[0].symbol)?.base ?? underlying.replace(/USDT$/, "");
    const oi = await this.openInterest(base, chosen.code).catch(() => new Map<string, number>());
    const quote = (s: OptionSymbolInfo, withOi: boolean): OptionQuote => {
      const t = tickers.get(s.symbol) ?? {};
      const m = marks.get(s.symbol) ?? {};
      return {
        symbol: s.symbol,
        bid: num(t.bidPrice),
        ask: num(t.askPrice),
        last: num(t.lastPrice),
        volume: num(t.volume) ?? 0,
        openInterest: withOi ? (oi.get(s.symbol) ?? 0) : null,
        mark: num(m.markPrice),
        iv: num(m.markIV),
        delta: num(m.delta),
        gamma: num(m.gamma),
        theta: num(m.theta),
        vega: num(m.vega),
      };
    };
    const index = num((indexBody as Record<string, unknown> | null)?.indexPrice);
    const rows = chainRows(all.filter((s) => s.expiry === chosen!.time).map((s) => quote(s, true)));
    const term = expiries.flatMap((e) => {
      const iv = atmIv(
        chainRows(all.filter((s) => s.expiry === e.time).map((s) => quote(s, false))),
        index,
      );
      return iv === null ? [] : [{ time: e.time, iv }];
    });
    chosen = { ...chosen };
    return { symbol: `BINANCE:${underlying}`, underlying, index, expiries, expiry: chosen, rows, term, time: this.now() };
  }
}
