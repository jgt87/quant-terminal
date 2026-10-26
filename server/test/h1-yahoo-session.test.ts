import { describe, expect, it } from "vitest";
import { yahooInfo, yahooSession } from "../src/providers/yahoo";

describe("Yahoo symbol info: exchange time zone and session", () => {
  it("reports the time zone and the regular session in exchange-local time", () => {
    const meta = {
      instrumentType: "EQUITY",
      exchangeTimezoneName: "America/New_York",
      gmtoffset: -14400,
      currentTradingPeriod: { regular: { start: 1791552600, end: 1791576000, gmtoffset: -14400 } },
    };
    expect(yahooSession(meta)).toBe("0930-1600");
    const info = yahooInfo(meta, "AAPL");
    expect(info.timezone).toBe("America/New_York");
    expect(info.session).toBe("0930-1600");
  });

  it("winter offsets give the same local session", () => {
    // 2026-11-03 14:30–21:00 UTC = 09:30–16:00 EST.
    expect(yahooSession({ currentTradingPeriod: { regular: { start: 1793716200, end: 1793739600, gmtoffset: -18000 } } })).toBe("0930-1600");
  });

  it("leaves both out when the meta lacks them (non-breaking)", () => {
    const info = yahooInfo({ instrumentType: "EQUITY" }, "AAPL");
    expect("timezone" in info).toBe(false);
    expect("session" in info).toBe(false);
  });
});
