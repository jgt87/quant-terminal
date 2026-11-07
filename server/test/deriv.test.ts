import { describe, expect, it } from "vitest";
import { MarketData, routeSymbol } from "../src/providers";
import {
  aggregateDaily,
  DERIV_HISTORY_SEC,
  DerivClient,
  DerivProvider,
  NO_VOLUME_NOTICE,
  parseCandles,
  type DerivSocket,
} from "../src/providers/deriv";
import { planStream } from "../src/routes/stream";
import { HttpError } from "../src/errors";

type Msg = Record<string, unknown> & { req_id: number };
/** Answer for a request: one message, several (a subscription's ticks) or nothing. */
type Handler = (msg: Msg, server: FakeDeriv) => Record<string, unknown> | Record<string, unknown>[] | undefined;

const SYMBOLS = [
  { underlying_symbol: "frxEURUSD", underlying_symbol_name: "EUR/USD", market: "forex", submarket: "major_pairs", exchange_is_open: 1 },
  { underlying_symbol: "frxGBPUSD", underlying_symbol_name: "GBP/USD", market: "forex", submarket: "major_pairs", exchange_is_open: 0 },
  { underlying_symbol: "cryBTCUSD", underlying_symbol_name: "BTC/USD", market: "cryptocurrency", submarket: "non_stable_coin", exchange_is_open: 1 },
  { underlying_symbol: "OTC_NDX", underlying_symbol_name: "US Tech 100", market: "indices", submarket: "americas_OTC", exchange_is_open: 1 },
  { underlying_symbol: "R_100", underlying_symbol_name: "Volatility 100 Index", market: "synthetic_index", submarket: "random_index", exchange_is_open: 1 },
];

/** In-memory Deriv: records requests, answers through `handler`, can drop the connection. */
class FakeDeriv {
  sent: Msg[] = [];
  sockets: DerivSocket[] = [];
  constructor(public handler: Handler) {}

  factory = (): DerivSocket => {
    const sock: DerivSocket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: (data: string) => {
        const msg = JSON.parse(data) as Msg;
        this.sent.push(msg);
        const out = this.handler(msg, this);
        for (const m of out === undefined ? [] : Array.isArray(out) ? out : [out]) this.push(sock, { req_id: msg.req_id, echo_req: msg, ...m });
      },
      close: () => queueMicrotask(() => sock.onclose?.()),
    };
    this.sockets.push(sock);
    queueMicrotask(() => sock.onopen?.());
    return sock;
  };

  push(sock: DerivSocket, m: Record<string, unknown>): void {
    queueMicrotask(() => sock.onmessage?.({ data: JSON.stringify(m) }));
  }

  /** Drop the newest connection as the server would. */
  drop(): void {
    this.sockets.at(-1)?.onclose?.();
  }

  of(type: string): Msg[] {
    return this.sent.filter((m) => type in m);
  }
}

const NOW = Date.UTC(2026, 10, 6, 12, 0) / 1000; // Friday
const H = 3600;

function candles(from: number, count: number, step: number, base = 1.1) {
  return Array.from({ length: count }, (_, i) => ({ epoch: from + i * step, open: base, high: base + 0.01, low: base - 0.01, close: base + i * 1e-4 }));
}

/** Deriv-like answers: symbol list, hourly candles of the range, ticks. */
function standard(extra?: Handler): Handler {
  return (msg, server) => {
    const custom = extra?.(msg, server);
    if (custom) return custom;
    if ("active_symbols" in msg) return { msg_type: "active_symbols", active_symbols: SYMBOLS };
    if ("ticks_history" in msg && msg.style === "candles") {
      const g = Number(msg.granularity);
      const end = msg.end === "latest" ? NOW : Number(msg.end);
      // Deriv serves [end - count * g, end] clipped to its one-year window, with a partial first
      // candle (off the grid) where the range starts inside a bucket.
      const start = Math.max(end - Number(msg.count) * g, NOW - DERIV_HISTORY_SEC);
      const first = Math.floor(start / g) * g + g;
      const full = candles(first, Math.floor((end - first) / g) + 1, g).slice(-Number(msg.count));
      return { msg_type: "candles", candles: [{ epoch: start + 7, open: 1, high: 1, low: 1, close: 1 }, ...full] };
    }
    if ("ticks_history" in msg) return { msg_type: "history", history: { prices: [1.2345], times: [NOW - 5] } };
    if ("forget" in msg) return { msg_type: "forget", forget: 1 };
    return { error: { code: "UnknownRequest", message: "unknown" } };
  };
}

function provider(handler: Handler) {
  const server = new FakeDeriv(handler);
  const client = new DerivClient({ socket: server.factory, spacingMs: 0, resubscribeMs: 20, timeoutMs: 1000 });
  return { server, client, deriv: new DerivProvider(client, () => NOW) };
}

describe("Deriv candles", () => {
  it("drops the partial first candle and invalid prices, sorts and dedupes", () => {
    const bars = parseCandles(
      [
        { epoch: 3605, open: 1, high: 1, low: 1, close: 1 },
        { epoch: 7200, open: "1.2", high: "1.3", low: "1.1", close: "1.25" },
        { epoch: 3600, open: 1, high: 1.1, low: 0.9, close: 1 },
        { epoch: 10800, open: 1, high: Number.NaN, low: 1, close: 1 },
        { epoch: 7200, open: 9, high: 9, low: 9, close: 9 },
      ],
      3600,
    );
    expect(bars).toEqual([
      { time: 3600, open: 1, high: 1.1, low: 0.9, close: 1, volume: 0 },
      { time: 7200, open: 1.2, high: 1.3, low: 1.1, close: 1.25, volume: 0 },
    ]);
  });

  it("builds Monday-based weeks and calendar months from daily bars", () => {
    const daily = parseCandles(candles(Date.UTC(2026, 9, 28) / 1000, 10, 86400), 86400); // Wed 28 Oct .. Fri 6 Nov
    const weeks = aggregateDaily(daily, "1W");
    expect(weeks.map((b) => new Date(b.time * 1000).toISOString().slice(0, 10))).toEqual(["2026-10-26", "2026-11-02"]);
    expect(weeks[0].open).toBe(daily[0].open);
    expect(weeks[0].close).toBe(daily[4].close); // Sunday 1 Nov closes week one
    const months = aggregateDaily(daily, "1M");
    expect(months.map((b) => new Date(b.time * 1000).toISOString().slice(0, 10))).toEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("Deriv routing", () => {
  it.each([
    ["DERIV:EURUSD", "EURUSD"],
    ["deriv:frxEURUSD", "EURUSD"],
    ["DERIV:cryBTCUSD", "BTCUSD"],
    ["DERIV:R_100", "R_100"],
    ["DERIV:OTC_NDX", "OTC_NDX"],
  ])("%s → DERIV:%s", (input, ticker) => {
    expect(routeSymbol(input, null)).toEqual({ provider: "deriv", ticker, canonical: `DERIV:${ticker}` });
  });

  it("sends FX pairs to Deriv with fxProvider deriv", () => {
    for (const s of ["FX:EURUSD", "OANDA:EURUSD", "EURUSD=X"]) expect(routeSymbol(s, null, "deriv").canonical).toBe("DERIV:EURUSD");
    expect(routeSymbol("EURUSD=X", null).provider).toBe("yahoo");
  });

  it("is off without a socket", async () => {
    const market = new MarketData();
    await expect(market.bars("DERIV:EURUSD", "1h", undefined, 10)).rejects.toMatchObject({ status: 400, message: "The Deriv feed is off" });
    expect(await market.deriv.search("eur")).toEqual([]);
  });
});

describe("Deriv bars", () => {
  it("loads the latest page with symbol info and the no-volume notice", async () => {
    const { server, deriv } = provider(standard());
    const page = await deriv.bars("EURUSD", "1h", undefined, 50);
    expect(page.info).toMatchObject({ symbol: "DERIV:EURUSD", name: "EUR/USD", type: "fx", currency: "USD", provider: "deriv", exchange: "Deriv" });
    expect(page.bars).toHaveLength(50);
    expect(page.bars.at(-1)!.time).toBe(NOW);
    expect(page.bars.every((b) => b.time % H === 0 && b.volume === 0)).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(page.notices).toEqual([NO_VOLUME_NOTICE]);
    expect(server.of("ticks_history")[0]).toMatchObject({ ticks_history: "frxEURUSD", style: "candles", granularity: 3600, count: 50, end: "latest" });
  });

  it("caps a page at Deriv's 999 candles and pages back with end = to - 1", async () => {
    const { server, deriv } = provider(standard());
    await deriv.bars("EURUSD", "1m", undefined, 5000);
    expect(server.of("ticks_history")[0].count).toBe(999);
    const to = NOW - 10 * H;
    const page = await deriv.bars("EURUSD", "1h", to, 20);
    expect(server.of("ticks_history")[1]).toMatchObject({ end: to - 1, count: 20 });
    expect(page.bars.every((b) => b.time < to)).toBe(true);
    expect(page.notices).toBeUndefined();
  });

  it("answers requests before the one-year window without asking Deriv, and says why", async () => {
    const { server, deriv } = provider(standard());
    const page = await deriv.bars("EURUSD", "1h", NOW - DERIV_HISTORY_SEC - H, 100);
    expect(page).toMatchObject({ bars: [], hasMore: false });
    expect(page.notices?.[0]).toMatch(/only keeps about one year of history; older EUR\/USD bars are not available\. For longer history use YAHOO:EURUSD=X\./);
    expect(server.of("ticks_history")).toHaveLength(0);
  });

  it("detects Deriv answering an old end with the latest bars", async () => {
    // Deriv ignores an end it considers too old and returns the newest candles.
    const { deriv } = provider(standard((msg) => (msg.end !== "latest" && "ticks_history" in msg ? { msg_type: "candles", candles: candles(NOW - 5 * H, 5, H) } : undefined)));
    const page = await deriv.bars("EURUSD", "1h", NOW - 200 * 86400, 100);
    expect(page).toMatchObject({ bars: [], hasMore: false });
    expect(page.notices?.[0]).toMatch(/about one year of history/);
  });

  it("reports the history limit once the oldest page reaches the window", async () => {
    const { deriv } = provider(standard());
    const page = await deriv.bars("EURUSD", "1D", undefined, 1000);
    expect(page.hasMore).toBe(false);
    expect(page.bars[0].time).toBeGreaterThanOrEqual(NOW - DERIV_HISTORY_SEC);
    expect(page.notices).toEqual([NO_VOLUME_NOTICE, expect.stringMatching(/about one year of history/)]);
  });

  it("steps back over a weekend that returns no candles", async () => {
    let n = 0;
    const { server, deriv } = provider(standard((msg) => ("ticks_history" in msg && n++ < 2 ? { msg_type: "candles", candles: [] } : undefined)));
    const page = await deriv.bars("EURUSD", "1m", undefined, 999);
    const ends = server.of("ticks_history").map((m) => m.end);
    expect(ends).toEqual(["latest", NOW - 999 * 60, NOW - 2 * 999 * 60]);
    expect(page.bars.length).toBeGreaterThan(0);
  });

  it("builds weekly bars from daily candles and says so", async () => {
    const { server, deriv } = provider(standard());
    const page = await deriv.bars("EURUSD", "1W", undefined, 10);
    expect(server.of("ticks_history")[0]).toMatchObject({ granularity: 86400, count: 999 });
    expect(page.bars).toHaveLength(10);
    expect(page.bars.every((b) => new Date(b.time * 1000).getUTCDay() === 1)).toBe(true);
    expect(page.hasMore).toBe(false);
    expect(page.notices).toEqual(expect.arrayContaining([expect.stringMatching(/no weekly candles; they are built from its daily bars/)]));
  });

  it("tells the user about a closed market and about pairs Deriv does not list", async () => {
    const { deriv } = provider(standard());
    expect((await deriv.bars("GBPUSD", "1h", undefined, 5)).notices).toContain("The GBP/USD market is closed on Deriv right now; the chart updates when it reopens.");
    const unlisted = await deriv.bars("USDZAR", "1h", undefined, 5);
    expect(unlisted.info.symbol).toBe("DERIV:USDZAR");
    expect(unlisted.notices).toContain("USDZAR is not in Deriv's list of offered symbols: its history loads, but live prices may not arrive.");
  });

  it("maps Deriv errors to clear messages", async () => {
    const { deriv } = provider(standard((msg) => ("ticks_history" in msg ? { error: { code: "InvalidSymbol", message: "Invalid symbol." } } : undefined)));
    await expect(deriv.bars("EURHUF", "1h", undefined, 5)).rejects.toMatchObject({ status: 404, message: "Deriv does not offer EURHUF" });
    await expect(deriv.lookup("NOT_A_THING")).rejects.toBeInstanceOf(HttpError);
  });

  it("retries once after Deriv's rate limit", async () => {
    let n = 0;
    const { server, deriv } = provider(standard((msg) => ("ticks_history" in msg && n++ === 0 ? { error: { code: "RateLimit", message: "slow down" } } : undefined)));
    const page = await deriv.bars("EURUSD", "1h", undefined, 5);
    expect(page.bars).toHaveLength(5);
    expect(server.of("ticks_history")).toHaveLength(2);
  }, 10_000);
});

describe("Deriv search and quotes", () => {
  it("finds symbols by name or title, real markets before synthetic indices", async () => {
    const { deriv } = provider(standard());
    expect((await deriv.search("eur")).map((s) => s.symbol)).toEqual(["DERIV:EURUSD"]);
    expect((await deriv.search("US")).map((s) => s.symbol)).toEqual(["DERIV:OTC_NDX", "DERIV:BTCUSD", "DERIV:EURUSD", "DERIV:GBPUSD"]);
    expect((await deriv.search("volatility")).map((s) => s.symbol)).toEqual(["DERIV:R_100"]);
  });

  it("quotes the latest tick against the previous daily close", async () => {
    const { deriv } = provider(standard());
    const [q] = await deriv.quotes(["EURUSD"]);
    expect(q.symbol).toBe("DERIV:EURUSD");
    expect(q.last).toBe(1.2345);
    expect(q.time).toBe(NOW - 5);
    expect(q.change).toBeCloseTo(1.2345 - (1.1 + 5e-4), 10);
  });
});

describe("Deriv live ticks", () => {
  const tickHandler = (closed = new Set<string>()): Handler =>
    standard((msg) => {
      if (!("ticks" in msg)) return undefined;
      const sym = String(msg.ticks);
      if (closed.has(sym)) return { error: { code: "MarketIsClosed", message: "This market is presently closed." } };
      const sub = { id: `sub-${sym}-${msg.req_id}` };
      return [1, 2].map((i) => ({ msg_type: "tick", subscription: sub, tick: { symbol: sym, quote: 1 + i / 100, bid: 1, ask: 1.1, epoch: NOW + i } }));
    });

  it("delivers ticks, then forgets the subscription when the last listener stops", async () => {
    const { server, deriv } = provider(tickHandler());
    const got: number[] = [];
    const sub = await deriv.subscribe("EURUSD", (t) => got.push(t.quote));
    expect(await sub.ready).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toEqual([1.01, 1.02]);
    sub.stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(server.of("forget")[0].forget).toMatch(/^sub-frxEURUSD-/);
    expect(deriv.client!.subscribed()).toEqual([]);
  });

  it("restores subscriptions after the connection drops", async () => {
    const { server, deriv } = provider(tickHandler());
    const sub = await deriv.subscribe("EURUSD", () => {});
    await sub.ready;
    server.drop();
    await new Promise((r) => setTimeout(r, 1200)); // first reconnect after 1 s
    expect(server.sockets).toHaveLength(2);
    expect(server.of("ticks").map((m) => m.ticks)).toEqual(["frxEURUSD", "frxEURUSD"]);
    sub.stop();
  }, 10_000);

  it("reports a closed market and keeps trying until it opens", async () => {
    const closed = new Set(["frxGBPUSD"]);
    const { server, deriv } = provider(tickHandler(closed));
    const got: number[] = [];
    const sub = await deriv.subscribe("GBPUSD", (t) => got.push(t.quote));
    expect(await sub.ready).toBe("Deriv: This market is presently closed.");
    closed.clear();
    await new Promise((r) => setTimeout(r, 80));
    expect(server.of("ticks").length).toBeGreaterThanOrEqual(2);
    expect(got.length).toBeGreaterThan(0);
    sub.stop();
  });

  it("plans Deriv symbols for the stream next to the MT5 ones", async () => {
    const server = new FakeDeriv(standard());
    const market = new MarketData({ derivSocket: server.factory, fxProvider: "deriv" });
    const plan = await planStream(market, ["DERIV:EURUSD", "EURUSD=X", "AAPL", "DERIV:NOPE_X"]);
    expect([...plan.deriv]).toEqual([["EURUSD", ["DERIV:EURUSD", "EURUSD=X"]]]);
    expect(plan.errors.map((e) => e.symbol)).toEqual(["AAPL", "DERIV:NOPE_X"]);
    expect(plan.errors[0].error).toMatch(/only MT5 and Deriv symbols stream/);
    market.deriv.client!.close();
  });
});
