import { describe, expect, it } from "vitest";
import { journalCsv, journalStats, parseTags, roundTrips, type JournalFill } from "../src/journal";

let t = 0;
const fill = (symbol: string, side: "buy" | "sell", qty: number, fillPrice: number, realizedPnl = 0, commission = 0): JournalFill => ({
  id: `f${++t}`,
  symbol,
  side,
  qty,
  fillPrice,
  filledAt: t * 1000,
  realizedPnl,
  commission,
});

describe("trade journal round trips", () => {
  it("groups fills from flat to flat, scaling in and out, per symbol", () => {
    t = 0;
    const fills = [
      fill("AAPL", "buy", 1, 100, 0, 1),
      fill("MSFT", "sell", 2, 50),
      fill("AAPL", "buy", 1, 110, 0, 1),
      fill("AAPL", "sell", 1, 120, 15, 1),
      fill("AAPL", "sell", 1, 90, -15, 1),
    ];
    const trips = roundTrips(fills);
    expect(trips.map((x) => [x.symbol, x.side, x.open])).toEqual([["MSFT", "short", true], ["AAPL", "long", false]]);
    const a = trips[1];
    expect(a).toMatchObject({ id: "f1", qty: 2, entryPrice: 105, exitPrice: 105, closedQty: 2, realizedPnl: 0, commission: 4, netPnl: -4, fills: 4, entryTime: 1000, exitTime: 5000 });
  });

  it("closes the trade on a flip and opens the other side with the rest", () => {
    t = 0;
    const trips = roundTrips([fill("X", "buy", 1, 10), fill("X", "sell", 3, 12, 2, 3)]);
    expect(trips).toHaveLength(2);
    const [short, long] = trips.sort((a, b) => a.side.localeCompare(b.side)).reverse();
    expect(long).toMatchObject({ side: "long", open: false, realizedPnl: 2, commission: 1, netPnl: 1 });
    expect(short).toMatchObject({ side: "short", open: true, qty: 2, entryPrice: 12, commission: 2 });
  });

  it("summarises closed trades", () => {
    t = 0;
    const trips = roundTrips([
      fill("A", "buy", 1, 10),
      fill("A", "sell", 1, 14, 4),
      fill("B", "buy", 1, 10),
      fill("B", "sell", 1, 8, -2),
      fill("C", "buy", 1, 10),
      fill("C", "sell", 1, 12, 2),
      fill("D", "buy", 1, 10),
    ]);
    const s = journalStats(trips);
    expect(s).toMatchObject({ trades: 3, wins: 2, losses: 1, netPnl: 4, grossProfit: 6, grossLoss: -2, profitFactor: 3, avgWin: 3, avgLoss: -2, best: 4, worst: -2 });
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(journalStats([])).toMatchObject({ trades: 0, winRate: null, profitFactor: null });
  });

  it("parses tags and writes CSV with notes", () => {
    expect(parseTags(" breakout, news #fomo breakout ")).toEqual(["breakout", "news", "fomo"]);
    t = 0;
    const trips = roundTrips([fill("A", "buy", 1, 10), fill("A", "sell", 1, 11, 1)]);
    const csv = journalCsv(trips, { f1: { note: 'Waited, "clean" entry', tags: ["plan"], updatedAt: 0 } }).split("\n");
    expect(csv[0]).toBe("symbol,side,qty,entry_time,entry_price,exit_time,exit_price,realized_pnl,commission,net_pnl,status,tags,note");
    expect(csv[1]).toBe('A,long,1,1970-01-01T00:00:01.000Z,10,1970-01-01T00:00:02.000Z,11,1,0,1,closed,plan,"Waited, ""clean"" entry"');
  });
});
