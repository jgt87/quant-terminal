import { describe, expect, it } from "vitest";
import { routeSymbol } from "../src/providers";
import { HttpError } from "../src/errors";

const pairs = new Set(["BTCUSDT", "ETHUSDT", "ETHBTC", "SOLUSDC", "BNBETH"]);

describe("routeSymbol", () => {
  const table: [string, ReadonlySet<string> | null, string, string, string][] = [
    // input, pair table, provider, ticker, canonical
    ["AAPL", pairs, "yahoo", "AAPL", "AAPL"],
    ["aapl", pairs, "yahoo", "AAPL", "AAPL"],
    ["^NDX", pairs, "yahoo", "^NDX", "^NDX"],
    ["NASDAQ:NDX", pairs, "yahoo", "^NDX", "^NDX"],
    ["NASDAQ:AAPL", pairs, "yahoo", "AAPL", "AAPL"],
    ["SP:SPX", pairs, "yahoo", "^GSPC", "^GSPC"],
    ["SPX", pairs, "yahoo", "^GSPC", "^GSPC"],
    ["TVC:DJI", pairs, "yahoo", "^DJI", "^DJI"],
    ["CBOE:VIX", pairs, "yahoo", "^VIX", "^VIX"],
    ["FX:EURUSD", pairs, "yahoo", "EURUSD=X", "EURUSD=X"],
    ["EURUSD=X", pairs, "yahoo", "EURUSD=X", "EURUSD=X"],
    ["BTC-USD", pairs, "yahoo", "BTC-USD", "BTC-USD"],
    ["BRK-B", pairs, "yahoo", "BRK-B", "BRK-B"],
    ["BINANCE:BTCUSDT", pairs, "binance", "BTCUSDT", "BINANCE:BTCUSDT"],
    ["binance:ethusdt", pairs, "binance", "ETHUSDT", "BINANCE:ETHUSDT"],
    ["BTCUSDT", pairs, "binance", "BTCUSDT", "BINANCE:BTCUSDT"],
    ["ETHBTC", pairs, "binance", "ETHBTC", "BINANCE:ETHBTC"],
    ["SOLUSDC", pairs, "binance", "SOLUSDC", "BINANCE:SOLUSDC"],
    // Ends in a crypto quote but Binance does not list it → Yahoo.
    ["FAKEUSDT", pairs, "yahoo", "FAKEUSDT", "FAKEUSDT"],
    ["SETH", pairs, "yahoo", "SETH", "SETH"],
    // Pair table not loaded: stablecoin-quoted → Binance, BTC/ETH-quoted → Yahoo.
    ["XRPUSDT", null, "binance", "XRPUSDT", "BINANCE:XRPUSDT"],
    ["ETHBTC", null, "yahoo", "ETHBTC", "ETHBTC"],
  ];
  it.each(table)("%s → %s %s", (input, p, provider, ticker, canonical) => {
    expect(routeSymbol(input, p)).toEqual({ provider, ticker, canonical });
  });

  it.each(["", "  ", "BINANCE:", "AA PL", "../etc", "NASDAQ:A;B"])("rejects %j", (bad) => {
    expect(() => routeSymbol(bad, pairs)).toThrow(HttpError);
  });
});
