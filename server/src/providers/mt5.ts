import type { Interval, Quote, SymbolInfo, SymbolType } from "@qt/core";
import { validateBars } from "../bars";
import { fetchJson, notFound, providerError, type BarsPage, type FetchFn, type MarketProvider } from "./types";

/** Local MetaTrader 5 bridge (bridge/mt5_bridge.py). Read-only market data. */
export const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL ?? "http://127.0.0.1:4191";
export const MT5_PREFIX = "MT5:";

interface BridgeSymbol {
  symbol: string;
  description: string;
  path: string;
  digits: number;
  currency: string;
}

interface BridgeQuote {
  symbol: string;
  last: number;
  change: number;
  changePct: number;
  time: number;
}

/** Instrument class from the broker's symbol tree path (e.g. "Forex\\Majors\\EURUSD"). */
export function mt5Type(path: string): SymbolType {
  const p = path.toLowerCase();
  if (p.startsWith("forex") || p.startsWith("fx")) return "fx";
  if (p.includes("crypto")) return "crypto";
  if (p.includes("indices") || p.includes("index")) return "index";
  if (p.includes("stock") || p.includes("share") || p.includes("equit")) return "stock";
  if (p.includes("etf")) return "etf";
  if (p.includes("future")) return "future";
  return "other";
}

export function toSymbolInfo(s: BridgeSymbol): SymbolInfo {
  return {
    symbol: `${MT5_PREFIX}${s.symbol}`,
    name: s.description || s.symbol,
    exchange: "MT5",
    type: mt5Type(s.path),
    currency: s.currency,
    provider: "mt5",
  };
}

export class Mt5Provider implements MarketProvider {
  private info = new Map<string, SymbolInfo>();
  private healthy: { ok: boolean; at: number } = { ok: false, at: 0 };

  constructor(
    private readonly fetchFn: FetchFn,
    readonly baseUrl: string = MT5_BRIDGE_URL,
  ) {}

  /** Bridge reachability, cached for 15 s so search stays fast when MT5 is not running. */
  async available(): Promise<boolean> {
    if (Date.now() - this.healthy.at < 15_000) return this.healthy.ok;
    let ok = false;
    try {
      const res = await this.fetchFn(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      ok = res.ok && Boolean(((await res.json()) as { ok?: boolean }).ok);
    } catch {
      ok = false;
    }
    this.healthy = { ok, at: Date.now() };
    return ok;
  }

  private async get(path: string): Promise<unknown> {
    const { status, body } = await fetchJson(this.fetchFn, `${this.baseUrl}${path}`, "MT5 bridge");
    if (status === 404) throw notFound(String((body as { error?: string })?.error ?? "Not found in MT5"));
    if (status !== 200) throw providerError(`MT5 bridge HTTP ${status}`);
    return body;
  }

  async symbolInfo(ticker: string): Promise<SymbolInfo> {
    const cached = this.info.get(ticker);
    if (cached) return cached;
    const list = (await this.get(`/symbols?q=${encodeURIComponent(ticker)}`)) as BridgeSymbol[];
    const exact = list.find((s) => s.symbol.toUpperCase() === ticker.toUpperCase());
    if (!exact) throw notFound(`Unknown MT5 symbol: ${ticker}`);
    const info = toSymbolInfo(exact);
    this.info.set(ticker, info);
    return info;
  }

  async bars(ticker: string, interval: Interval, to: number | undefined, limit: number): Promise<BarsPage> {
    const info = await this.symbolInfo(ticker);
    const qs = new URLSearchParams({ symbol: exactName(info), interval, limit: String(limit) });
    if (to !== undefined) qs.set("to", String(to));
    const body = (await this.get(`/bars?${qs}`)) as { bars: unknown[]; hasMore: boolean };
    if (!body || !Array.isArray(body.bars)) throw providerError("MT5 bridge: unexpected bars payload");
    return { info, bars: validateBars(body.bars as never), hasMore: Boolean(body.hasMore) };
  }

  /** Recorded ticks in [from, to) (UTC seconds) from the bridge, oldest first. */
  async ticks(ticker: string, from: number, to: number, limit: number): Promise<{ ticks: { time: number; price: number; qty: number }[]; complete: boolean }> {
    const info = await this.symbolInfo(ticker);
    const qs = new URLSearchParams({ symbol: exactName(info), from: String(from), to: String(to), limit: String(limit) });
    const body = (await this.get(`/ticks?${qs}`)) as { ticks?: unknown[]; complete?: boolean };
    if (!body || !Array.isArray(body.ticks)) throw providerError("MT5 bridge: unexpected ticks payload");
    const ticks = (body.ticks as { time: number; price: number; qty?: number }[])
      .filter((t) => Number.isFinite(t.time) && t.price > 0)
      .map((t) => ({ time: t.time, price: t.price, qty: Number(t.qty) || 0 }));
    return { ticks, complete: body.complete !== false };
  }

  async search(q: string): Promise<SymbolInfo[]> {
    if (!(await this.available())) return [];
    const list = (await this.get(`/symbols?q=${encodeURIComponent(q)}`)) as BridgeSymbol[];
    return list.slice(0, 20).map((s) => {
      const info = toSymbolInfo(s);
      this.info.set(s.symbol.toUpperCase(), info);
      return info;
    });
  }

  async quotes(tickers: string[]): Promise<Quote[]> {
    if (tickers.length === 0) return [];
    const names = await Promise.all(tickers.map((t) => this.symbolInfo(t).then(exactName).catch(() => null)));
    const valid = names.filter((n): n is string => n !== null);
    if (valid.length === 0) return [];
    const list = (await this.get(`/quotes?symbols=${encodeURIComponent(valid.join(","))}`)) as BridgeQuote[];
    return list.map((q) => ({
      symbol: `${MT5_PREFIX}${q.symbol.toUpperCase()}`,
      last: q.last,
      change: q.change,
      changePct: q.changePct,
      time: q.time,
    }));
  }

  /** Upstream SSE tick stream for the given broker symbols. */
  async stream(tickers: string[], signal: AbortSignal): Promise<Response> {
    const names = await Promise.all(tickers.map((t) => this.symbolInfo(t).then(exactName)));
    const res = await this.fetchFn(`${this.baseUrl}/stream?symbols=${encodeURIComponent(names.join(","))}`, { signal });
    if (!res.ok || !res.body) throw providerError(`MT5 bridge stream HTTP ${res.status}`);
    return res;
  }
}

/** Broker symbol names are case-sensitive (e.g. "AAPL.NAS"); recover it from the canonical id. */
function exactName(info: SymbolInfo): string {
  return info.symbol.slice(MT5_PREFIX.length);
}
