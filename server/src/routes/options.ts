// Options routes (Binance options, public market data):
//   GET /api/options/underlyings              pairs with listed options
//   GET /api/options/chain?symbol=&expiry=    chain of one expiry (UTC ms; nearest when omitted)

import type { Router } from "../http";
import type { MarketData } from "../providers";
import { badRequest, notFound } from "../errors";
import { intParam } from "./market";

/** The options underlying of an app symbol (BINANCE:BTCUSDT, BTCUSDT or BTC). */
export async function optionsUnderlying(market: MarketData, raw: string): Promise<string> {
  const list = await market.options.underlyings();
  const s = raw.trim().toUpperCase().replace(/^BINANCE:/, "");
  if (list.includes(s)) return s;
  if (list.includes(`${s}USDT`)) return `${s}USDT`;
  const route = await market.resolve(raw).catch(() => null);
  if (route?.provider === "binance" && list.includes(route.ticker)) return route.ticker;
  throw notFound(`No listed options for ${raw} (options: ${list.map((u) => u.replace(/USDT$/, "")).join(", ")})`);
}

export function registerOptionsRoutes(router: Router, market: MarketData): void {
  router.get("/api/options/underlyings", async () => ({ underlyings: (await market.options.underlyings()).map((u) => ({ underlying: u, symbol: `BINANCE:${u}` })) }));

  router.get("/api/options/chain", async ({ url }) => {
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) throw badRequest("symbol is required");
    const expiry = intParam(url, "expiry");
    return market.options.chain(await optionsUnderlying(market, symbol), expiry);
  });
}
