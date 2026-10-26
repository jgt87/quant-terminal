import { describe, expect, it } from "vitest";
import { matchTick, mergeStreamErrors } from "../src/api/liveFeed";

const tick = (symbol: string, ids?: string[]) => ({ symbol, ids, bid: 1, time: 1 });

describe("tick matching by canonical id", () => {
  it("matches by the requested ids the server echoes (aliases and broker suffixes)", () => {
    expect(matchTick(tick("MT5:EURUSD", ["EURUSD=X"]), ["EURUSD=X"])).toBe("EURUSD=X");
    expect(matchTick(tick("MT5:AAPL.NAS", ["MT5:AAPL.NAS"]), ["MT5:AAPL.NAS", "AAPL"])).toBe("MT5:AAPL.NAS");
    expect(matchTick(tick("MT5:EURUSDM", ["MT5:EURUSDm"]), ["MT5:EURUSDm"])).toBe("MT5:EURUSDm");
  });

  it("never matches a different instrument with the same base name", () => {
    // The old base-name rule matched BINANCE:EURUSD / FX:EURUSD to an MT5 tick; ids do not.
    expect(matchTick(tick("MT5:EURUSD", ["MT5:EURUSD"]), ["BINANCE:EURUSD"])).toBeNull();
    expect(matchTick(tick("MT5:AAPL.NAS", ["MT5:AAPL.NAS"]), ["AAPL"])).toBeNull();
    expect(matchTick(tick("MT5:EURUSD", []), ["MT5:EURUSD"])).toBeNull();
  });

  it("falls back to the canonical id, then the base name, for servers without ids", () => {
    expect(matchTick(tick("MT5:AAPL.NAS"), ["mt5:aapl.nas"])).toBe("mt5:aapl.nas");
    expect(matchTick(tick("MT5:EURUSD"), ["EURUSD=X"])).toBe("EURUSD=X");
  });

  it("merges error frames (later empty frames keep earlier errors)", () => {
    const m = new Map<string, string>();
    mergeStreamErrors(m, { errors: [{ symbol: "MT5:nope", error: "Unknown MT5 symbol: NOPE" }] });
    mergeStreamErrors(m, { errors: [] });
    mergeStreamErrors(m, null);
    expect([...m.entries()]).toEqual([["MT5:NOPE", "Unknown MT5 symbol: NOPE"]]);
  });
});
