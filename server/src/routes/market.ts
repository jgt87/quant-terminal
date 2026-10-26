import type { Router } from "../http";
import type { BarOptions, MarketData } from "../providers";
import { badRequest } from "../errors";
import { parseInterval } from "../bars";

export const MAX_LIMIT = 5000;
export const DEFAULT_LIMIT = 1000;

/** Parse an optional integer query parameter. */
export function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw badRequest(`${name} must be an integer`);
  return n;
}

/** `adjust=dividends` and `session=extended` (anything else for these keys is rejected). */
export function barOptions(url: URL): BarOptions {
  const opts: BarOptions = {};
  const adjust = url.searchParams.get("adjust");
  if (adjust !== null && adjust !== "" && adjust !== "none") {
    if (adjust !== "dividends") throw badRequest("adjust must be dividends or none");
    opts.adjust = "dividends";
  }
  const session = url.searchParams.get("session");
  if (session !== null && session !== "" && session !== "regular") {
    if (session !== "extended") throw badRequest("session must be regular or extended");
    opts.session = "extended";
  }
  return opts;
}

export function registerMarketRoutes(router: Router, market: MarketData): void {
  router.get("/api/health", () => ({ ok: true }));

  router.get("/api/search", async ({ url }) => {
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return [];
    if (q.length > 64) throw badRequest("q is too long");
    return market.search(q);
  });

  router.get("/api/bars", async ({ url }) => {
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) throw badRequest("symbol is required");
    const intervalRaw = url.searchParams.get("interval") ?? "1D";
    const interval = parseInterval(intervalRaw);
    if (!interval) throw badRequest(`Unknown interval: ${intervalRaw}`);
    const to = intParam(url, "to");
    if (to !== undefined && to <= 0) throw badRequest("to must be a positive UTC timestamp in seconds");
    const limit = intParam(url, "limit") ?? DEFAULT_LIMIT;
    if (limit < 1 || limit > MAX_LIMIT) throw badRequest(`limit must be between 1 and ${MAX_LIMIT}`);
    return market.bars(symbol, interval, to, limit, barOptions(url));
  });

  router.get("/api/events", async ({ url }) => {
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) throw badRequest("symbol is required");
    return market.events(symbol);
  });

  router.get("/api/quotes", async ({ url }) => {
    const symbols = (url.searchParams.get("symbols") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (symbols.length === 0) return [];
    if (symbols.length > 200) throw badRequest("Too many symbols (max 200)");
    return market.quotes(symbols);
  });
}
