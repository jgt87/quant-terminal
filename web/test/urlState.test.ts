import { describe, expect, it } from "vitest";
import { parseUrlState, serializeUrlState } from "../src/state/urlState";

describe("URL deep links", () => {
  it("parses symbol, interval, tab and layout", () => {
    expect(parseUrlState("?symbol=AAPL&interval=1h&tab=t-1&layout=e2e")).toEqual({ symbol: "AAPL", interval: "1h", tab: "t-1", layout: "e2e" });
    expect(parseUrlState("?symbol=MT5:EURUSD")).toEqual({ symbol: "MT5:EURUSD" });
    expect(parseUrlState("?symbol=%5EGSPC")).toEqual({ symbol: "^GSPC" });
  });

  it("ignores invalid values", () => {
    expect(parseUrlState("?symbol=<script>&interval=7x&tab=../a&layout=a b")).toEqual({});
    expect(parseUrlState("")).toEqual({});
  });

  it("serializes the active cell, drops layout and keeps other params", () => {
    const s = serializeUrlState("?layout=e2e&debug=1", { tab: "t1", symbol: "MT5:EURUSD", interval: "15m" });
    expect(s).toBe("?debug=1&tab=t1&symbol=MT5:EURUSD&interval=15m");
    expect(parseUrlState(s)).toEqual({ tab: "t1", symbol: "MT5:EURUSD", interval: "15m" });
  });

  it("round-trips", () => {
    const state = { tab: "t-default", symbol: "^GSPC", interval: "1D" as const };
    expect(parseUrlState(serializeUrlState("", state))).toEqual(state);
  });
});
