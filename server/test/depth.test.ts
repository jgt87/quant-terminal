import { describe, expect, it } from "vitest";
import type { DepthSnapshot } from "@qt/core";
import { BookFeed, parseDepthUpdate, STREAM_URL, type SocketLike } from "../src/depth/feed";
import { DepthService } from "../src/depth/service";
import { MarketData } from "../src/providers";
import { BinanceProvider } from "../src/providers/binance";
import { fakeFetch } from "./helpers";

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
  send(U: number, u: number, b: [number, number][] = [], a: [number, number][] = []) {
    this.onmessage?.({ data: JSON.stringify({ e: "depthUpdate", E: 1, s: "BTCUSDT", U, u, b: b.map(String2), a: a.map(String2) }) });
  }
}
const String2 = ([p, q]: [number, number]) => [String(p), String(q)];

const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(snaps: DepthSnapshot[]) {
  const sockets: FakeSocket[] = [];
  let calls = 0;
  const feed = new BookFeed("BTCUSDT", {
    socket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    snapshot: async () => snaps[Math.min(calls++, snaps.length - 1)],
    timers: false,
    now: () => 1000,
  });
  return { feed, sockets, calls: () => calls };
}

const depthStub = (url: URL) => {
  if (url.pathname.endsWith("/depth")) return { body: { lastUpdateId: 7, bids: [["100.4", "1"], ["100.1", "2"], ["99.6", "4"]], asks: [["100.6", "1"], ["101.3", "3"]] } };
  if (url.pathname.endsWith("/exchangeInfo")) return { body: { symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" }] } };
  return undefined;
};

describe("depth stream parsing", () => {
  it("reads depthUpdate messages only", () => {
    expect(parseDepthUpdate(JSON.stringify({ e: "depthUpdate", E: 5, U: 1, u: 3, b: [["1", "2"]], a: [] }))).toEqual({ U: 1, u: 3, bids: [[1, 2]], asks: [], time: 5 });
    expect(parseDepthUpdate(JSON.stringify({ e: "trade" }))).toBeNull();
    expect(parseDepthUpdate("not json")).toBeNull();
  });
});

describe("book feed", () => {
  it("buffers updates, loads the snapshot, drops what it contains and applies the rest", async () => {
    const h = harness([{ lastUpdateId: 10, bids: [[99, 1]], asks: [[101, 1]] }]);
    h.feed.start();
    const s = h.sockets[0];
    expect(s.url).toBe(`${STREAM_URL}/stream?streams=btcusdt@depth@100ms/btcusdt@aggTrade`);
    s.onopen!();
    s.send(5, 9, [[99, 7]]); // contained in the snapshot
    s.send(10, 12, [[98, 2]]); // straddles it
    await tick();
    await tick();
    expect(h.feed.synced).toBe(true);
    expect(h.feed.book.bids.get(99)).toBe(1);
    expect(h.feed.book.bids.get(98)).toBe(2);
    s.send(13, 14, [], [[100.5, 3]]);
    expect(h.feed.book.bestAsk()).toBe(100.5);
    expect(h.feed.mode).toBe("stream");
    const frame = h.feed.sample(2000)!;
    expect(frame.step).toBe(0.01);
    expect(h.feed.history(0, 5000)).toHaveLength(1);
    h.feed.stop();
    expect(s.closed).toBe(true);
  });

  it("resyncs from a new snapshot after a gap", async () => {
    const h = harness([
      { lastUpdateId: 10, bids: [[99, 1]], asks: [[101, 1]] },
      { lastUpdateId: 30, bids: [[90, 5]], asks: [[110, 5]] },
    ]);
    h.feed.start();
    const s = h.sockets[0];
    s.onopen!();
    await tick();
    expect(h.feed.synced).toBe(true);
    s.send(20, 25); // missed 11..19
    expect(h.feed.synced).toBe(false);
    s.send(26, 31, [[91, 1]]);
    await tick();
    await tick();
    expect(h.calls()).toBe(2);
    expect(h.feed.synced).toBe(true);
    expect(h.feed.book.bestBid()).toBe(91);
    expect(h.feed.resyncs).toBe(2);
    h.feed.stop();
  });

  it("falls back to polling snapshots when the stream closes", async () => {
    const h = harness([
      { lastUpdateId: 10, bids: [[99, 1]], asks: [[101, 1]] },
      { lastUpdateId: 50, bids: [[95, 1]], asks: [[105, 1]] },
    ]);
    h.feed.start();
    h.sockets[0].onopen!();
    await tick();
    h.sockets[0].onclose!();
    expect(h.feed.mode).toBe("poll");
    await h.feed.pollOnce();
    expect(h.feed.book.bestBid()).toBe(95);
    h.feed.stop();
  });
});

describe("depth service and Binance snapshot", () => {

  it("parses the REST snapshot", async () => {
    const fetchFn = fakeFetch(depthStub);
    const s = await new BinanceProvider(fetchFn).depthSnapshot("BTCUSDT", 99999);
    expect(fetchFn.calls[0]).toContain("limit=5000");
    expect(s.lastUpdateId).toBe(7);
    expect(s.bids[0]).toEqual([100.4, 1]);
  });

  it("serves binned views, rejects other providers and stops idle feeds", async () => {
    let now = 0;
    const sockets: FakeSocket[] = [];
    const svc = new DepthService(new MarketData({ fetchFn: fakeFetch(depthStub) }), {
      socket: (u) => {
        const s = new FakeSocket(u);
        sockets.push(s);
        queueMicrotask(() => s.onopen?.());
        return s;
      },
      timers: false,
      now: () => now,
      idleMs: 1000,
    });
    const view = await svc.snapshot("BINANCE:BTCUSDT", 10, 1);
    expect(view.synced).toBe(true);
    expect(view.bids).toEqual([[100, 3], [99, 4]]);
    expect(view.asks).toEqual([[101, 1], [102, 3]]);
    const raw = svc.view(await svc.feed("BINANCE:BTCUSDT"), 1, 0);
    expect(raw.bids).toEqual([[100.4, 1]]);
    await expect(svc.snapshot("AAPL", 10, 0)).rejects.toThrow(/Binance symbol/);
    const sub = await svc.subscribe("BINANCE:BTCUSDT", () => {});
    now = 5000;
    svc.sweep();
    expect(svc.status()).toHaveLength(1);
    sub.unsubscribe();
    now = 10_000;
    svc.sweep();
    expect(svc.status()).toHaveLength(0);
    expect(sockets[0].closed).toBe(true);
  });
});

describe("order book recording", () => {
  it("writes sparse frames per pair and day at most every everyMs and reads them back", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { DepthRecorder, decodeFrame, encodeFrame } = await import("../src/depth/recorder");
    const dir = await mkdtemp(path.join(os.tmpdir(), "qt-depth-"));
    try {
      const rec = new DepthRecorder(dir, 5000);
      const day = Date.UTC(2026, 10, 1);
      const f = (t: number) => ({ time: t, step: 1, base: 100, qty: [0, 2, 0, 3], bid: 101, ask: 103 });
      expect(encodeFrame(f(1)).q).toEqual([[1, 2], [3, 3]]);
      expect(decodeFrame(encodeFrame(f(1)))).toEqual(f(1));
      expect(decodeFrame({ t: "x" })).toBeNull();
      await rec.write("BTCUSDT", f(day - 6000));
      expect(rec.write("BTCUSDT", f(day + 1000))).not.toBeNull();
      expect(rec.write("BTCUSDT", f(day + 2000))).toBeNull(); // within 5 s
      await rec.write("BTCUSDT", f(day + 7000));
      expect((await readFile(path.join(dir, "BTCUSDT", "2026-11-01.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
      const back = await rec.read("BTCUSDT", day - 10_000, day + 10_000);
      expect(back.map((x) => x.time)).toEqual([day - 6000, day + 1000, day + 7000]);
      expect(() => rec.write("../x", f(day))).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps recorded feeds open, lists them and merges disk frames into the history", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { DepthRecorder } = await import("../src/depth/recorder");
    const { Store } = await import("../src/store");
    const dir = await mkdtemp(path.join(os.tmpdir(), "qt-depth-"));
    try {
      let now = 1_000_000;
      const rec = new DepthRecorder(path.join(dir, "depth"), 0);
      await rec.write("BTCUSDT", { time: 500_000, step: 1, base: 90, qty: [1], bid: 100, ask: 101 });
      const svc = new DepthService(new MarketData({ fetchFn: fakeFetch(depthStub) }), {
        socket: (u) => {
          const s = new FakeSocket(u);
          queueMicrotask(() => s.onopen?.());
          return s;
        },
        timers: false,
        now: () => now,
        idleMs: 1000,
        recorder: rec,
        store: new Store(path.join(dir, "store")),
      });
      const list = await svc.setRecording("BINANCE:BTCUSDT", true);
      expect(list.map((r) => r.symbol)).toEqual(["BINANCE:BTCUSDT"]);
      const feed = await svc.feed("BINANCE:BTCUSDT");
      await svc.ready(feed);
      feed.sample(now);
      const h = await svc.history("BINANCE:BTCUSDT", 0, now + 1);
      expect(h.recording).toBe(true);
      expect(h.frames.map((f) => f.time)).toEqual([500_000, now]);
      now += 60_000;
      svc.sweep();
      expect(svc.status()).toHaveLength(1);
      expect((await svc.recorded("BINANCE:BTCUSDT", 0, now)).frames.length).toBeGreaterThanOrEqual(2);
      await svc.setRecording("BINANCE:BTCUSDT", false);
      expect(await svc.recordings()).toEqual([]);
      now += 60_000;
      svc.sweep();
      expect(svc.status()).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
