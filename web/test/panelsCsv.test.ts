import { describe, expect, it } from "vitest";
import type { PortfolioTransaction, Watchlist } from "@qt/core";
import { parseCsv } from "../src/panels/common/csv";
import { parseTransactionsCsv, transactionsToCsv } from "../src/panels/portfolio/txCsv";
import { allocationSlices } from "../src/panels/portfolio/AllocationDonut";
import { mergeIntoList, parseSymbolFile, setFlag, watchlistToCsv, watchlistToTxt } from "../src/panels/watchlist/watchlistModel";

describe("RFC 4180 parsing", () => {
  it("handles quotes, doubled quotes, embedded separators/newlines, CRLF/LF and a BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","multi\r\nline"\n1,,3\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "multi\r\nline"],
      ["1", "", "3"],
    ]);
  });
});

describe("portfolio transactions CSV", () => {
  const txs: PortfolioTransaction[] = [
    { id: "t1", time: Date.UTC(2024, 0, 2, 15, 30), symbol: "AAPL", side: "buy", qty: 10, price: 185.5, fee: 1 },
    { id: "t2", time: Date.UTC(2024, 5, 3), symbol: "BINANCE:BTCUSDT", side: "sell", qty: 0.125, price: 67000, fee: 0, note: 'took profit, "half"' },
  ];

  it("round-trips export -> import", () => {
    const csv = transactionsToCsv(txs);
    expect(csv.split("\r\n")[0]).toBe("id,time,symbol,side,qty,price,fee,note");
    expect(csv).toContain('"took profit, ""half"""');
    const { txs: back, errors } = parseTransactionsCsv(csv);
    expect(errors).toEqual([]);
    expect(back).toEqual(txs.map((t) => (t.note ? t : { ...t })));
  });

  it("accepts aliases and reports bad rows by line", () => {
    const { txs: back, errors } = parseTransactionsCsv("Date,Symbol,Side,Quantity,Price,Commission\n2024-03-01,MSFT,BUY,5,400,2\n2024-03-02,MSFT,hold,5,400,0\n,MSFT,sell,1,1,0\n");
    expect(back).toEqual([{ time: Date.parse("2024-03-01"), symbol: "MSFT", side: "buy", qty: 5, price: 400, fee: 2 }]);
    expect(errors).toEqual(["Line 3: side must be buy or sell", "Line 4: time is not a date"]);
  });
});

describe("watchlist import/export", () => {
  const w: Watchlist = { id: "w", name: "Main", symbols: ["AAPL", "EURUSD=X", "^NDX"], flags: { AAPL: "red" } };

  it("txt round trip, comments and separators", () => {
    expect(parseSymbolFile(watchlistToTxt(w), "x.txt").symbols).toEqual(w.symbols);
    const r = parseSymbolFile("# my list\nAAPL\n\nMSFT, NVDA\nbad symbol!!?\n", "list.txt");
    expect(r.symbols).toEqual(["AAPL", "MSFT", "NVDA", "bad"]);
    expect(r.skipped).toEqual(["symbol!!?"]);
  });

  it("csv round trip keeps flags and columns", () => {
    const csv = watchlistToCsv(w, ["last"], (s) => (s === "AAPL" ? 187.5 : null));
    expect(csv.split("\r\n").slice(0, 2)).toEqual(["symbol,flag,last", "AAPL,red,187.5"]);
    const r = parseSymbolFile(csv, "w.csv");
    expect(r.symbols).toEqual(w.symbols);
    expect(r.flags).toEqual({ AAPL: "red" });
    expect(parseSymbolFile("TSLA\nAMD\n", "x.csv").symbols).toEqual(["TSLA", "AMD"]);
  });

  it("merges imports and keeps flags limited to the list", () => {
    const m = mergeIntoList(w, ["MSFT", "AAPL"], { MSFT: "blue" });
    expect(m.symbols).toEqual(["AAPL", "EURUSD=X", "^NDX", "MSFT"]);
    expect(m.flags).toEqual({ AAPL: "red", MSFT: "blue" });
    const cleared = setFlag(setFlag(w, "AAPL", null), "GONE", "green");
    expect(cleared.flags).toBeUndefined();
  });
});

describe("allocation donut", () => {
  it("drops non-positive slices and merges tiny ones into Other", () => {
    const s = allocationSlices([
      { label: "A", value: 70 },
      { label: "B", value: 29 },
      { label: "C", value: 0.5 },
      { label: "D", value: 0.5 },
      { label: "Cash", value: -5 },
    ]);
    expect(s.map((x) => x.label)).toEqual(["A", "B", "Other"]);
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
  });
});
