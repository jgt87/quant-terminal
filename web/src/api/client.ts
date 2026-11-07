// Typed access to the server REST API. Bar requests for the chart go through `BarsLoader`
// so a quick symbol/interval change aborts the stale request.

import { showNotices } from "./notices";
import type { BacktestConfig, BacktestResult, BarsResponse, CorporateEvent, Interval, Layout, Quote, SymbolInfo, Watchlist } from "@qt/core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Parsed error response body (e.g. the stored layout on a 409 conflict). */
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `HTTP ${res.status}`, body);
  }
  return body as T;
}

export function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
  return request(`/api/search?q=${encodeURIComponent(q)}`, { signal });
}

export interface BarsQuery {
  symbol: string;
  interval: Interval;
  /** UTC seconds; only bars strictly older are returned. */
  to?: number;
  limit?: number;
  /** Dividend-adjusted prices (stocks). */
  adjust?: "dividends";
  /** Include pre-/post-market bars (intraday stocks). */
  session?: "extended";
}

/**
 * Bar requests are shared: identical requests in flight (several charts on the same symbol and
 * interval) use one fetch, and a result is reused for a moment after it arrives. Each caller's
 * signal only cancels its own wait; the fetch is aborted when no caller is left.
 */
interface SharedRequest {
  promise: Promise<BarsResponse>;
  ctrl: AbortController;
  refs: number;
}
const inflightBars = new Map<string, SharedRequest>();
const recentBars = new Map<string, { at: number; value: BarsResponse }>();
const BARS_REUSE_MS = 1500;

const abortError = () => new DOMException("The request was aborted", "AbortError");

export function getBars(q: BarsQuery, signal?: AbortSignal): Promise<BarsResponse> {
  const p = new URLSearchParams({ symbol: q.symbol, interval: q.interval });
  if (q.to != null) p.set("to", String(q.to));
  if (q.limit != null) p.set("limit", String(q.limit));
  if (q.adjust) p.set("adjust", q.adjust);
  if (q.session) p.set("session", q.session);
  const url = `/api/bars?${p}`;
  if (signal?.aborted) return Promise.reject(abortError());
  const hit = recentBars.get(url);
  if (hit && Date.now() - hit.at < BARS_REUSE_MS) return Promise.resolve(hit.value);
  let entry = inflightBars.get(url);
  if (!entry) {
    const ctrl = new AbortController();
    const e: SharedRequest = { ctrl, refs: 0, promise: Promise.resolve(null as unknown as BarsResponse) };
    e.promise = request<BarsResponse>(url, { signal: ctrl.signal })
      .then((value) => {
        const at = Date.now();
        for (const [k, v] of recentBars) if (at - v.at > BARS_REUSE_MS) recentBars.delete(k);
        recentBars.set(url, { at, value });
        showNotices(value.notices);
        return value;
      })
      .finally(() => {
        if (inflightBars.get(url) === e) inflightBars.delete(url);
      });
    inflightBars.set(url, e);
    entry = e;
  }
  const shared = entry;
  shared.refs++;
  if (!signal) return shared.promise;
  return new Promise<BarsResponse>((resolve, reject) => {
    const onAbort = () => {
      shared.refs--;
      if (shared.refs <= 0 && inflightBars.get(url) === shared) {
        inflightBars.delete(url);
        shared.ctrl.abort();
      }
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    shared.promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/** Number of bar fetches currently in flight (diagnostics and tests). */
export function inflightBarRequests(): number {
  return inflightBars.size;
}

/** Dividends, splits and earnings of a symbol (times in UTC seconds). */
export function getEvents(symbol: string, signal?: AbortSignal): Promise<CorporateEvent[]> {
  return request(`/api/events?symbol=${encodeURIComponent(symbol)}`, { signal });
}

export function getQuotes(symbols: string[], signal?: AbortSignal): Promise<Quote[]> {
  if (symbols.length === 0) return Promise.resolve([]);
  return request(`/api/quotes?symbols=${symbols.map(encodeURIComponent).join(",")}`, { signal });
}

export function getWatchlists(): Promise<Watchlist[]> {
  return request("/api/watchlists");
}

export function putWatchlists(lists: Watchlist[]): Promise<Watchlist[]> {
  return request("/api/watchlists", { method: "PUT", body: JSON.stringify(lists) });
}

export function listLayouts(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  return request("/api/layouts");
}

export function getLayout(id: string): Promise<Layout> {
  return request(`/api/layouts/${encodeURIComponent(id)}`);
}

/**
 * Save a layout. With `baseUpdatedAt` the server refuses (409, ApiError.code "conflict") when
 * the stored layout is newer; the stored layout is then in `(err.body as LayoutConflict).layout`.
 */
export function putLayout(layout: Layout, baseUpdatedAt?: number): Promise<Layout> {
  const body = baseUpdatedAt === undefined ? layout : { ...layout, baseUpdatedAt };
  return request(`/api/layouts/${encodeURIComponent(layout.id)}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteLayout(id: string): Promise<void> {
  return request(`/api/layouts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface ServerBacktestRequest {
  symbol: string;
  interval: Interval;
  strategyId: string;
  params: Record<string, number>;
  config: BacktestConfig;
}

export function postBacktest(req: ServerBacktestRequest, signal?: AbortSignal): Promise<BacktestResult> {
  return request("/api/backtest", { method: "POST", body: JSON.stringify(req), signal });
}

/**
 * Keeps one in-flight request per channel; starting a new one aborts the previous.
 * Late completions of canceled work reject with AbortError even if the provider ignores the signal.
 */
export class LatestRequest {
  private ctrl: AbortController | null = null;

  async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    try {
      const value = await fn(ctrl.signal);
      if (ctrl.signal.aborted) throw abortError();
      return value;
    } catch (error) {
      if (ctrl.signal.aborted) throw abortError();
      throw error;
    } finally {
      if (this.ctrl === ctrl) this.ctrl = null;
    }
  }

  abort(): void {
    this.ctrl?.abort();
    this.ctrl = null;
  }
}
