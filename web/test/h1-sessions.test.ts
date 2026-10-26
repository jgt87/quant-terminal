import { describe, expect, it } from "vitest";
import type { Bar, SymbolInfo } from "@qt/core";
import { composeSeries, planSeries } from "../src/data/compose";
import { commonAnchor } from "../src/data/seriesSource";
import { bucketAnchorFor, localToUtc, parseSession, resampleAnchored, zoneOffset, UTC_ANCHOR } from "../src/data/sessions";

const H = 3600;
const utc = (s: string) => Date.parse(s) / 1000;
const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16);
const bar = (time: number, close = 1): Bar => ({ time, open: close, high: close, low: close, close, volume: 1 });

/** Hourly regular-session bars of a US stock on a date: 09:30 … 15:30 New York time. */
function usSession(dateUtcOpen: number): Bar[] {
  return Array.from({ length: 7 }, (_, i) => bar(dateUtcOpen + i * H, i + 1));
}

const aapl: SymbolInfo = { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", type: "stock", currency: "USD", provider: "yahoo", timezone: "America/New_York", session: "0930-1600" };

describe("session-aligned custom intervals", () => {
  it("parses sessions and time zone offsets across DST", () => {
    expect(parseSession("0930-1600")).toEqual({ open: 570, close: 960 });
    expect(parseSession("bad")).toBeNull();
    expect(zoneOffset("America/New_York", utc("2026-10-30T15:00:00Z"))).toBe(-4 * H);
    expect(zoneOffset("America/New_York", utc("2026-11-03T15:00:00Z"))).toBe(-5 * H);
    // 09:30 New York on 2026-10-30 (EDT) and 2026-11-03 (EST).
    expect(iso(localToUtc("America/New_York", Math.floor(utc("2026-10-30T00:00:00Z") / 86400), 570))).toBe("2026-10-30T13:30");
    expect(iso(localToUtc("America/New_York", Math.floor(utc("2026-11-03T00:00:00Z") / 86400), 570))).toBe("2026-11-03T14:30");
  });

  it("buckets US 2h from the 09:30 open: 13:30 UTC in summer, 14:30 UTC in winter", () => {
    const bars = [...usSession(utc("2026-10-30T13:30:00Z")), ...usSession(utc("2026-11-02T14:30:00Z"))];
    const anchor = bucketAnchorFor(aapl, H, 2 * H);
    expect(anchor).toEqual({ kind: "session", timezone: "America/New_York", openMin: 570 });
    const out = resampleAnchored(bars, H, 2 * H, anchor);
    expect(out.map((b) => iso(b.time))).toEqual([
      "2026-10-30T13:30", "2026-10-30T15:30", "2026-10-30T17:30", "2026-10-30T19:30",
      "2026-11-02T14:30", "2026-11-02T16:30", "2026-11-02T18:30", "2026-11-02T20:30",
    ]);
    // OHLC per bucket: first open, last close, volume summed.
    expect(out[0]).toMatchObject({ open: 1, close: 2, volume: 2 });
    expect(out[3]).toMatchObject({ open: 7, close: 7, volume: 1 });
  });

  it("the same bars on the UTC grid start at even UTC hours (the old behaviour)", () => {
    const out = resampleAnchored(usSession(utc("2026-10-30T13:30:00Z")), H, 2 * H, UTC_ANCHOR);
    expect(iso(out[0].time)).toBe("2026-10-30T12:00");
  });

  it("extended-hours bars bucket backwards from the open", () => {
    const pre = [bar(utc("2026-10-30T08:00:00Z")), bar(utc("2026-10-30T11:00:00Z")), bar(utc("2026-10-30T13:30:00Z"))];
    const out = resampleAnchored(pre, 1800, 2 * H, bucketAnchorFor(aapl, 1800, 2 * H));
    expect(out.map((b) => iso(b.time))).toEqual(["2026-10-30T07:30", "2026-10-30T09:30", "2026-10-30T13:30"]);
  });

  it("24h markets, daily+ targets and unknown sessions stay on UTC", () => {
    expect(bucketAnchorFor({ ...aapl, type: "crypto" }, H, 2 * H)).toEqual(UTC_ANCHOR);
    expect(bucketAnchorFor({ ...aapl, type: "fx", session: "0000-2359" }, H, 2 * H)).toEqual(UTC_ANCHOR);
    expect(bucketAnchorFor({ ...aapl, session: "0000-0000" }, H, 2 * H)).toEqual(UTC_ANCHOR);
    expect(bucketAnchorFor(aapl, 86400, 2 * 86400)).toEqual(UTC_ANCHOR);
    expect(bucketAnchorFor({ ...aapl, timezone: undefined, session: undefined }, H, 2 * H)).toEqual(UTC_ANCHOR);
  });

  it("MT5 stock CFDs without a session anchor at the first bar after a break", () => {
    const cfd: SymbolInfo = { symbol: "MT5:AAPL.NAS", name: "Apple", exchange: "MT5", type: "stock", currency: "USD", provider: "mt5" };
    const anchor = bucketAnchorFor(cfd, H, 2 * H);
    expect(anchor).toEqual({ kind: "gap", gapSec: 2 * H });
    expect(bucketAnchorFor({ ...cfd, type: "fx" }, H, 2 * H)).toEqual(UTC_ANCHOR);
    const bars = [...usSession(utc("2026-10-30T13:30:00Z")), ...usSession(utc("2026-11-02T14:30:00Z"))];
    expect(resampleAnchored(bars, H, 2 * H, anchor).map((b) => iso(b.time))).toEqual([
      "2026-10-30T13:30", "2026-10-30T15:30", "2026-10-30T17:30", "2026-10-30T19:30",
      "2026-11-02T14:30", "2026-11-02T16:30", "2026-11-02T18:30", "2026-11-02T20:30",
    ]);
  });

  it("composeSeries uses the plan's anchor; mixed formula legs fall back to UTC", () => {
    const plan = { ...planSeries("AAPL", H, 2 * H), anchor: bucketAnchorFor(aapl, H, 2 * H) };
    const out = composeSeries(plan, { AAPL: usSession(utc("2026-03-06T14:30:00Z")) });
    expect(iso(out[0].time)).toBe("2026-03-06T14:30"); // before the March DST change: EST
    expect(commonAnchor([bucketAnchorFor(aapl, H, 2 * H), UTC_ANCHOR])).toEqual(UTC_ANCHOR);
    expect(commonAnchor([bucketAnchorFor(aapl, H, 2 * H), bucketAnchorFor(aapl, H, 2 * H)]).kind).toBe("session");
  });
});
