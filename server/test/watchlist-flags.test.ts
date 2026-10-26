import { describe, expect, it } from "vitest";
import { validateWatchlists } from "../src/validate";

describe("watchlist flags", () => {
  it("keeps valid flags of listed symbols and omits empty flags", () => {
    const [w] = validateWatchlists([{ id: "w", name: "W", symbols: ["AAPL", "MSFT"], flags: { AAPL: "red", GONE: "blue" } }]);
    expect(w).toEqual({ id: "w", name: "W", symbols: ["AAPL", "MSFT"], flags: { AAPL: "red" } });
    const [plain] = validateWatchlists([{ id: "p", name: "P", symbols: ["A"], flags: {} }]);
    expect(plain).toEqual({ id: "p", name: "P", symbols: ["A"] });
  });

  it("rejects unknown colors and non-object flags", () => {
    expect(() => validateWatchlists([{ id: "w", name: "W", symbols: ["A"], flags: { A: "magenta" } }])).toThrow(/flags\.A/);
    expect(() => validateWatchlists([{ id: "w", name: "W", symbols: ["A"], flags: ["red"] }])).toThrow(/flags must be an object/);
  });
});
