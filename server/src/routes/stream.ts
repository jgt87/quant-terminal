import { Readable } from "node:stream";
import type { Router } from "../http";
import type { MarketData } from "../providers";
import { badRequest, HttpError, providerError } from "../errors";
import { MT5_PREFIX } from "../providers/mt5";

/** A requested symbol that cannot stream, with the reason. */
export interface StreamError {
  symbol: string;
  error: string;
}

export interface StreamPlan {
  /** Broker name → the requested ids it serves (as the client sent them). */
  names: Map<string, string[]>;
  errors: StreamError[];
  /** Some symbol failed because the bridge (not the symbol) is unavailable. */
  bridgeDown: boolean;
}

/**
 * Resolves every requested symbol on its own: unknown, invalid or non-MT5 symbols are reported
 * and skipped, so one bad symbol never takes the shared stream down.
 */
export async function planStream(market: MarketData, raws: string[]): Promise<StreamPlan> {
  const names = new Map<string, string[]>();
  const errors: StreamError[] = [];
  let bridgeDown = false;
  await Promise.all(
    raws.map(async (raw) => {
      try {
        const route = await market.resolve(raw);
        if (route.provider !== "mt5") throw badRequest(`${raw} does not stream (only MT5 symbols stream)`);
        const info = await market.mt5.symbolInfo(route.ticker);
        const name = info.symbol.slice(MT5_PREFIX.length);
        const ids = names.get(name) ?? [];
        ids.push(raw);
        names.set(name, ids);
      } catch (e) {
        if (!(e instanceof HttpError) || e.status >= 500) bridgeDown = true;
        errors.push({ symbol: raw, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  errors.sort((a, b) => raws.indexOf(a.symbol) - raws.indexOf(b.symbol));
  for (const ids of names.values()) ids.sort((a, b) => raws.indexOf(a) - raws.indexOf(b));
  return { names, errors, bridgeDown };
}

/**
 * Rewrites one upstream SSE `data:` line for the client: tick names become canonical ids
 * (`MT5:NAME`) plus `ids`, the requested symbols that tick belongs to; upstream `errors` frames
 * list the requested ids, merged after `known` (the symbols that failed before streaming) so the
 * client gets one consolidated list. Returns null for lines passed through unchanged.
 */
export function rewriteLine(line: string, event: string, names: ReadonlyMap<string, string[]>, known: readonly StreamError[] = []): string | null {
  if (!line.startsWith("data: ")) return null;
  try {
    if (event === "errors") {
      const body = JSON.parse(line.slice(6)) as { symbols?: string[] };
      const upstream: StreamError[] = (body.symbols ?? []).flatMap((n) =>
        (names.get(n) ?? [`${MT5_PREFIX}${n}`]).map((symbol) => ({ symbol, error: `Unknown MT5 symbol: ${n}` })),
      );
      const errors = [...known, ...upstream.filter((u) => !known.some((k) => k.symbol === u.symbol))];
      return `data: ${JSON.stringify({ errors })}`;
    }
    const tick = JSON.parse(line.slice(6)) as { symbol: string; ids?: string[] };
    const ids = names.get(tick.symbol) ?? [];
    tick.symbol = `${MT5_PREFIX}${tick.symbol.toUpperCase()}`;
    tick.ids = ids;
    return `data: ${JSON.stringify(tick)}`;
  } catch {
    return null;
  }
}

/**
 * GET /api/stream?symbols=MT5:EURUSD,MT5:XAUUSD — Server-Sent Events with live ticks.
 * Only symbols served by the local MT5 bridge stream; others should keep polling /api/quotes.
 * The first frame is `event: errors` / `data: {"errors":[{"symbol","error"}]}` listing requested
 * symbols that cannot stream (empty when all can); they are skipped and the rest stream. It is sent
 * exactly once: the symbols that failed to resolve are merged into the bridge's own errors frame.
 * Each tick: `event: tick` / `data: {"symbol":"MT5:EURUSD","ids":["EURUSD=X"],"bid":..,"ask":..,"last":..,"time":..,"timeMs":..}`
 * where `ids` are the requested symbols the tick belongs to.
 */
export function registerStreamRoute(router: Router, market: MarketData): void {
  router.get("/api/stream", async ({ req, res, url }) => {
    const raws = [...new Set((url.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
    if (raws.length === 0 || raws.length > 50) throw badRequest("symbols: 1 to 50 required");
    const plan = await planStream(market, raws);
    // Nothing streamable because the bridge is down: a real error (the client retries later).
    if (plan.names.size === 0 && plan.bridgeDown) throw providerError(plan.errors[0]?.error ?? "MT5 bridge unavailable");

    const abort = new AbortController();
    req.on("close", () => abort.abort());
    const upstream = plan.names.size ? await market.mt5.stream([...plan.names.keys()], abort.signal) : null;

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    const errorsFrame = `event: errors\ndata: ${JSON.stringify({ errors: plan.errors })}\n\n`;

    if (!upstream) {
      res.write(errorsFrame);
      // Only unknown symbols: keep the connection open (no reconnect storm) with heartbeats.
      const beat = setInterval(() => !res.writableEnded && res.write(": ping\n\n"), 15_000);
      beat.unref();
      await new Promise<void>((resolve) => {
        abort.signal.addEventListener("abort", () => resolve());
        res.on("close", resolve);
      });
      clearInterval(beat);
      if (!res.writableEnded) res.end();
      return;
    }

    // One errors frame: the plan's failures are merged into the bridge's own errors frame. Should
    // the bridge start with another event (or stay silent), ours goes out alone at a frame boundary.
    let errorsSent = false;
    let atBoundary = true;
    const sendOwnErrors = () => {
      if (errorsSent || !atBoundary || res.writableEnded) return;
      errorsSent = true;
      res.write(errorsFrame);
    };
    const fallback = setTimeout(sendOwnErrors, 1500);
    fallback.unref();
    let buffer = "";
    let event = "message";
    const body = Readable.fromWeb(upstream.body as never);
    body.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("event: ")) {
          event = line.slice(7).trim();
          if (event === "errors") errorsSent = true;
          else sendOwnErrors();
        }
        const out = rewriteLine(line, event, plan.names, plan.errors);
        if (line === "") event = "message";
        res.write(`${out ?? line}\n`);
        atBoundary = line === "";
      }
    });
    await new Promise<void>((resolve) => {
      body.on("end", resolve);
      body.on("error", resolve);
      abort.signal.addEventListener("abort", () => resolve());
    });
    clearTimeout(fallback);
    body.destroy();
    res.end();
  });
}
