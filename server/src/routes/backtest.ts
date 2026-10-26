import type { BacktestConfig, Interval } from "@qt/core";
import type { Router } from "../http";
import { readJsonBody } from "../http";
import type { MarketData } from "../providers";
import { badRequest } from "../errors";
import { parseInterval } from "../bars";
import { MAX_LIMIT } from "./market";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const MINUTES: Partial<Record<Interval, number>> = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60 };

/** Bars per year used for annualisation when the client does not send one. */
export function defaultBarsPerYear(interval: Interval, crypto: boolean): number {
  const days = crypto ? 365 : 252;
  const hoursPerDay = crypto ? 24 : 6.5;
  switch (interval) {
    case "1D": return days;
    case "1W": return 52;
    case "1M": return 12;
    case "4h": return crypto ? days * 6 : days * 2;
    default: return Math.round((days * hoursPerDay * 60) / (MINUTES[interval] ?? 60));
  }
}

export function registerBacktestRoute(router: Router, market: MarketData): void {
  router.post("/api/backtest", async ({ req }) => {
    const body = await readJsonBody(req);
    if (!isObj(body)) throw badRequest("Body must be an object");
    const { symbol, strategyId } = body;
    if (typeof symbol !== "string" || !symbol.trim()) throw badRequest("symbol is required");
    if (typeof strategyId !== "string" || !strategyId) throw badRequest("strategyId is required");
    const interval = parseInterval(typeof body.interval === "string" ? body.interval : "1D");
    if (!interval) throw badRequest("interval is invalid");
    const params: Record<string, number> = {};
    if (body.params !== undefined) {
      if (!isObj(body.params)) throw badRequest("params must be an object");
      for (const [k, v] of Object.entries(body.params)) {
        if (typeof v !== "number" || !Number.isFinite(v)) throw badRequest(`params.${k} must be a number`);
        params[k] = v;
      }
    }
    if (body.config !== undefined && !isObj(body.config)) throw badRequest("config must be an object");

    // Loaded lazily so the server boots even while core modules are still in flux.
    const core = await import("@qt/core");
    const strategy = core.getStrategy(strategyId);
    if (!strategy) throw badRequest(`Unknown strategy: ${strategyId}`);

    // Up to 5000 bars; the provider layer pages upstream as needed and caches the result.
    const res = await market.bars(symbol, interval, undefined, MAX_LIMIT);
    if (res.bars.length < 2) throw badRequest("Not enough bars to backtest");

    const config: BacktestConfig = {
      initialCapital: 10_000,
      commissionBps: 0,
      commissionFixed: 0,
      slippageBps: 0,
      sizing: { mode: "percent-equity", percent: 100 },
      allowShort: false,
      barsPerYear: defaultBarsPerYear(interval, res.symbol.type === "crypto"),
      ...(body.config as Partial<BacktestConfig> | undefined),
    };
    if (!(config.initialCapital > 0)) throw badRequest("config.initialCapital must be positive");
    if (!(config.barsPerYear > 0)) throw badRequest("config.barsPerYear must be positive");
    return core.runBacktest(res.bars, strategy, params, config);
  });
}
