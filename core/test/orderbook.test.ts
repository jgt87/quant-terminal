import { describe, expect, it } from "vitest";
import { binLevels, depthFrame, depthStep, framePrice, OrderBook, parseLevels, thinFrames, type DepthFrame } from "../src/orderbook";

const snap = { lastUpdateId: 100, bids: [[99, 1], [98, 2], [97, 3]] as [number, number][], asks: [[101, 1], [102, 2]] as [number, number][] };

describe("order book", () => {
  it("loads a snapshot and reports the top of book", () => {
    const b = new OrderBook();
    b.load(snap);
    expect(b.bestBid()).toBe(99);
    expect(b.bestAsk()).toBe(101);
    expect(b.mid()).toBe(100);
    expect(b.levels("bid", 2)).toEqual([[99, 1], [98, 2]]);
    expect(b.levels("ask")).toEqual([[101, 1], [102, 2]]);
  });

  it("applies updates in sequence: absolute sizes, size 0 removes, stale ignored, gaps unsync", () => {
    const b = new OrderBook();
    expect(b.apply({ U: 1, u: 2, bids: [], asks: [] })).toBe("gap"); // no snapshot yet
    b.load(snap);
    expect(b.apply({ U: 90, u: 100, bids: [[99, 50]], asks: [] })).toBe("stale");
    expect(b.bids.get(99)).toBe(1);
    // First update after the snapshot may start before it (U <= last + 1 <= u).
    expect(b.apply({ U: 95, u: 105, bids: [[99, 0], [98.5, 4]], asks: [[100.5, 2]] })).toBe("applied");
    expect(b.bestBid()).toBe(98.5);
    expect(b.bestAsk()).toBe(100.5);
    expect(b.lastUpdateId).toBe(105);
    expect(b.apply({ U: 106, u: 110, bids: [], asks: [[100.5, 0]] })).toBe("applied");
    expect(b.bestAsk()).toBe(101);
    expect(b.apply({ U: 112, u: 115, bids: [], asks: [] })).toBe("gap");
    expect(b.synced).toBe(false);
    expect(b.apply({ U: 111, u: 115, bids: [], asks: [] })).toBe("gap");
  });

  it("trims the far levels and parses exchange level lists", () => {
    const b = new OrderBook();
    b.load(snap);
    b.trim(1);
    expect(b.levels("bid")).toEqual([[99, 1]]);
    expect(b.levels("ask")).toEqual([[101, 1]]);
    expect(parseLevels([["1.5", "2"], ["x", "1"], "bad", ["2", "0"]])).toEqual([[1.5, 2], [2, 0]]);
    expect(parseLevels(null)).toEqual([]);
  });

  it("bins bids down and asks up", () => {
    expect(binLevels([[99.9, 1], [99.1, 2], [98.7, 3]], 1, "bid")).toEqual([[99, 3], [98, 3]]);
    expect(binLevels([[100.1, 1], [100.9, 2], [101, 3]], 1, "ask")).toEqual([[101, 6]]);
    expect(binLevels([[5, 1]], 0, "bid")).toEqual([[5, 1]]);
  });

  it("builds heatmap frames around the mid and thins them keeping the heaviest", () => {
    expect(depthStep(100000)).toBe(10);
    expect(depthStep(1.2345)).toBe(0.0002);
    const b = new OrderBook();
    b.load(snap);
    const f = depthFrame(b, 5000, 1, 10)!;
    expect(f.base).toBe(95);
    expect(f.qty).toEqual([0, 0, 3, 2, 1, 0, 1, 2, 0, 0]);
    expect(framePrice(f, 4)).toBe(99);
    expect(f.bid).toBe(99);
    expect(depthFrame(new OrderBook(), 0, 1)).toBeNull();
    const frames: DepthFrame[] = [1, 5, 2, 2, 9, 1, 3].map((q, i) => ({ time: i, step: 1, base: 0, qty: [q], bid: null, ask: null }));
    expect(thinFrames(frames, 3).map((x) => x.qty[0])).toEqual([5, 9, 3]);
    expect(thinFrames(frames, 10)).toHaveLength(7);
  });
});
