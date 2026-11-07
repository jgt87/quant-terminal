// Order book service: one live BookFeed per Binance pair in use, started on the first request and
// stopped after `idleMs` without requests or stream subscribers. At most `maxFeeds` run at once.

import { binLevels, thinFrames, type BookLevel, type DepthFrame } from "@qt/core";
import type { MarketData } from "../providers";
import { badRequest, HttpError } from "../errors";
import type { Store } from "../store";
import { BookFeed, defaultSocket, type FeedMode, type SocketFactory } from "./feed";
import type { DepthRecorder } from "./recorder";

/** Store collection with one item per recorded pair. */
export const RECORDING_COLLECTION = "depth-recording";

export interface Recording {
  id: string;
  symbol: string;
  /** UTC ms when recording was turned on. */
  since: number;
}

export interface DepthServiceOptions {
  socket?: SocketFactory;
  now?: () => number;
  idleMs?: number;
  maxFeeds?: number;
  /** Feed options passed through (tests turn timers off). */
  timers?: boolean;
  sampleMs?: number;
  historyMs?: number;
  /** Disk recording (optional; without it recording is unavailable). */
  recorder?: DepthRecorder;
  /** Where the list of recorded pairs is kept. */
  store?: Store;
}

export interface BookView {
  symbol: string;
  /** UTC ms of the last book change. */
  time: number;
  mode: FeedMode;
  synced: boolean;
  bid: number | null;
  ask: number | null;
  /** Bin size used for `bids` / `asks` (0 = raw levels). */
  step: number;
  /** Heatmap bin size of this feed (null until the first mid price). */
  heatStep: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
}

interface Entry {
  feed: BookFeed;
  lastUse: number;
  subs: number;
  /** Recorded pairs stay open while recording is on. */
  recording: boolean;
}

export const MAX_BOOK_LEVELS = 500;
/** Levels per side in a REST snapshot (5000 = the exchange maximum, weight 250). */
export const SNAPSHOT_LEVELS = 5000;
export const MAX_HISTORY_FRAMES = 4000;

export class DepthService {
  private readonly feeds = new Map<string, Entry>();
  private readonly now: () => number;
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly market: MarketData,
    private readonly opts: DepthServiceOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** Binance pair for an app symbol (order books are Binance-only). */
  async ticker(raw: string): Promise<string> {
    const route = await this.market.resolve(raw);
    if (route.provider !== "binance") throw badRequest("Order book data needs a Binance symbol (BINANCE:…)");
    return route.ticker;
  }

  /** The running feed for a symbol, started when needed. */
  async feed(raw: string): Promise<BookFeed> {
    const ticker = await this.ticker(raw);
    let e = this.feeds.get(ticker);
    if (!e) {
      this.sweep();
      if (this.feeds.size >= (this.opts.maxFeeds ?? 8)) throw new HttpError(429, "bad_request", "Too many order books open; close one first");
      const feed = new BookFeed(ticker, {
        socket: this.opts.socket ?? defaultSocket,
        snapshot: (t) => this.market.binance.depthSnapshot(t, SNAPSHOT_LEVELS),
        now: this.opts.now,
        timers: this.opts.timers,
        sampleMs: this.opts.sampleMs,
        historyMs: this.opts.historyMs,
        onFrame: (t, f) => {
          if (this.feeds.get(t)?.recording) this.opts.recorder?.write(t, f);
        },
      });
      e = { feed, lastUse: this.now(), subs: 0, recording: false };
      this.feeds.set(ticker, e);
      feed.start();
      this.startSweeper();
    }
    e.lastUse = this.now();
    return e.feed;
  }

  /** Waits up to `ms` for the feed's first synced book. */
  async ready(feed: BookFeed, ms = 6000): Promise<void> {
    const end = this.now() + ms;
    while (!feed.synced && feed.mode !== "stopped" && this.now() < end) await new Promise((r) => setTimeout(r, 100));
  }

  view(feed: BookFeed, levels: number, step: number): BookView {
    const n = Math.max(1, Math.min(MAX_BOOK_LEVELS, levels));
    const side = (s: "bid" | "ask") => {
      if (!(step > 0)) return feed.book.levels(s, n);
      return binLevels(feed.book.levels(s), step, s).slice(0, n);
    };
    return {
      symbol: `BINANCE:${feed.ticker}`,
      time: feed.updatedAt,
      mode: feed.mode,
      synced: feed.synced,
      bid: feed.book.bestBid(),
      ask: feed.book.bestAsk(),
      step: step > 0 ? step : 0,
      heatStep: feed.step,
      bids: side("bid"),
      asks: side("ask"),
    };
  }

  async snapshot(raw: string, levels: number, step: number): Promise<BookView> {
    const feed = await this.feed(raw);
    await this.ready(feed);
    return this.view(feed, levels, step);
  }

  /**
   * Heatmap frames in [from, to] (UTC ms), thinned to at most `max`: the feed's memory, and for a
   * recorded pair also the frames on disk from before the memory starts.
   */
  async history(raw: string, from: number, to: number, max = MAX_HISTORY_FRAMES) {
    const feed = await this.feed(raw);
    let frames: DepthFrame[] = feed.history(from, to);
    const rec = this.opts.recorder;
    if (rec) {
      const memStart = frames[0]?.time ?? feed.history(0, Number.MAX_SAFE_INTEGER)[0]?.time ?? to + 1;
      if (from < memStart) {
        const disk = await rec.read(feed.ticker, from, Math.min(to, memStart - 1));
        frames = [...disk, ...frames];
      }
    }
    return { symbol: `BINANCE:${feed.ticker}`, step: feed.step, mode: feed.mode, recording: this.isRecording(feed.ticker), frames: thinFrames(frames, Math.min(max, MAX_HISTORY_FRAMES)) };
  }

  /** Recorded frames only (depth replay), in [from, to] UTC ms. */
  async recorded(raw: string, from: number, to: number, max = MAX_HISTORY_FRAMES) {
    const ticker = await this.ticker(raw);
    const rec = this.opts.recorder;
    const disk = rec ? await rec.read(ticker, from, to) : [];
    const mem = this.feeds.get(ticker)?.feed.history(from, to) ?? [];
    const last = disk[disk.length - 1]?.time ?? -Infinity;
    const frames = [...disk, ...mem.filter((f) => f.time > last)];
    return { symbol: `BINANCE:${ticker}`, frames: thinFrames(frames, Math.min(max, MAX_HISTORY_FRAMES)) };
  }

  isRecording(ticker: string): boolean {
    return this.feeds.get(ticker)?.recording ?? false;
  }

  /** Recorded pairs (from the store). */
  async recordings(): Promise<Recording[]> {
    return this.opts.store ? (await this.opts.store.listItems<Recording>(RECORDING_COLLECTION)).sort((a, b) => a.symbol.localeCompare(b.symbol)) : [];
  }

  /** Turns disk recording of a pair on or off; recorded pairs keep their feed open. */
  async setRecording(raw: string, on: boolean): Promise<Recording[]> {
    const rec = this.opts.recorder;
    if (!rec || !this.opts.store) throw badRequest("Order book recording is not available on this server");
    const ticker = await this.ticker(raw);
    if (on) {
      const feed = await this.feed(raw);
      this.feeds.get(feed.ticker)!.recording = true;
      const existing = await this.opts.store.getItem<Recording>(RECORDING_COLLECTION, ticker);
      if (!existing) await this.opts.store.putItem<Recording>(RECORDING_COLLECTION, ticker, { id: ticker, symbol: `BINANCE:${ticker}`, since: this.now() });
    } else {
      const e = this.feeds.get(ticker);
      if (e) (e.recording = false), (e.lastUse = this.now());
      await this.opts.store.deleteItem(RECORDING_COLLECTION, ticker);
    }
    return this.recordings();
  }

  /** Reopens the feeds of the recorded pairs (server start). */
  async restoreRecordings(): Promise<void> {
    for (const r of await this.recordings()) {
      try {
        const feed = await this.feed(r.symbol);
        this.feeds.get(feed.ticker)!.recording = true;
      } catch {
        /* pair gone or too many feeds: skipped */
      }
    }
  }

  /** Keeps the feed alive while a stream client is connected. */
  async subscribe(raw: string, fn: () => void): Promise<{ feed: BookFeed; unsubscribe: () => void }> {
    const feed = await this.feed(raw);
    const e = this.feeds.get(feed.ticker)!;
    e.subs++;
    const off = feed.onChange(fn);
    return {
      feed,
      unsubscribe: () => {
        off();
        e.subs--;
        e.lastUse = this.now();
      },
    };
  }

  /** Feeds currently running (diagnostics). */
  status() {
    return [...this.feeds.values()].map((e) => ({ symbol: `BINANCE:${e.feed.ticker}`, mode: e.feed.mode, synced: e.feed.synced, subscribers: e.subs, recording: e.recording, resyncs: e.feed.resyncs }));
  }

  /** Stops feeds nobody used for `idleMs`. */
  sweep(): void {
    const idle = this.opts.idleMs ?? 5 * 60_000;
    for (const [k, e] of this.feeds) {
      if (e.subs <= 0 && !e.recording && this.now() - e.lastUse > idle) {
        e.feed.stop();
        this.feeds.delete(k);
      }
    }
    if (!this.feeds.size && this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }

  stopAll(): void {
    for (const e of this.feeds.values()) e.feed.stop();
    this.feeds.clear();
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  private startSweeper(): void {
    if (this.sweeper || this.opts.timers === false) return;
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }
}
