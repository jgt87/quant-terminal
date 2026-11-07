// Live order book for one Binance pair: the depth update stream (WebSocket, 100 ms) applied on top
// of a REST snapshot, following the exchange's documented procedure: buffer updates, load a
// snapshot, drop updates it already contains, apply the rest in sequence and start over on a gap.
// When the stream is down the feed polls REST snapshots instead and keeps trying to reconnect.
// A sampler stores a price-binned frame of the book every `sampleMs` for the liquidity heatmap.

import { depthFrame, depthStep, IcebergTracker, OrderBook, parseLevels, type DepthDiff, type DepthFrame, type DepthSnapshot, type FlowEvent, type FlowTrade } from "@qt/core";

/** The part of a WebSocket the feed uses (the global WebSocket in Node 22+, a fake in tests). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

export const defaultSocket: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

export type FeedMode = "connecting" | "stream" | "poll" | "stopped";

export interface FeedOptions {
  socket: SocketFactory;
  snapshot: (ticker: string) => Promise<DepthSnapshot>;
  now?: () => number;
  /** Heatmap sample interval. */
  sampleMs?: number;
  /** How long heatmap frames are kept in memory. */
  historyMs?: number;
  /** REST snapshot interval while the stream is down. */
  pollMs?: number;
  /** Most levels kept per side. */
  maxLevels?: number;
  /** Called with every stored frame (disk recording). */
  onFrame?: (ticker: string, frame: DepthFrame) => void;
  /** Start timers (tests drive the feed by hand). */
  timers?: boolean;
}

export const STREAM_URL = "wss://stream.binance.com:9443";
const BUFFER_MAX = 5000;
const EVENTS_MAX = 500;

/** Combined stream of a pair: depth updates and aggregated trades. */
export const streamUrl = (ticker: string) => `${STREAM_URL}/stream?streams=${ticker.toLowerCase()}@depth@100ms/${ticker.toLowerCase()}@aggTrade`;

/** One stream message (combined-stream wrapper removed), or null. */
function messageOf(raw: unknown): Record<string, unknown> | null {
  try {
    const d = JSON.parse(typeof raw === "string" ? raw : String(raw)) as Record<string, unknown>;
    const inner = d && typeof d === "object" && "data" in d && "stream" in d ? (d.data as Record<string, unknown>) : d;
    return inner && typeof inner === "object" ? inner : null;
  } catch {
    return null;
  }
}

/** Parses one `depthUpdate` stream message. */
export function parseDepthUpdate(raw: unknown): DepthDiff | null {
  const d = messageOf(raw);
  if (d?.e !== "depthUpdate" || typeof d.U !== "number" || typeof d.u !== "number") return null;
  return { U: d.U, u: d.u, bids: parseLevels(d.b), asks: parseLevels(d.a), time: typeof d.E === "number" ? d.E : undefined };
}

/** Parses one `aggTrade` stream message (buyer-is-maker = aggressive sell). */
export function parseStreamTrade(raw: unknown): FlowTrade | null {
  const d = messageOf(raw);
  if (d?.e !== "aggTrade") return null;
  const price = Number(d.p);
  const qty = Number(d.q);
  if (!Number.isFinite(price) || !(qty > 0) || typeof d.T !== "number") return null;
  return { id: Number(d.a) || 0, time: d.T, price, qty, buy: d.m !== true };
}

export class BookFeed {
  readonly book = new OrderBook();
  mode: FeedMode = "connecting";
  /** Heatmap bin size, fixed once the first mid price is known. */
  step: number | null = null;
  /** UTC ms of the last book change. */
  updatedAt = 0;
  /** Number of resyncs after a gap (diagnostics). */
  resyncs = 0;
  private readonly frames: DepthFrame[] = [];
  private readonly events: FlowEvent[] = [];
  private readonly icebergs = new IcebergTracker(3);
  private readonly tradeSizes: number[] = [];
  private buffer: DepthDiff[] = [];
  private socket: SocketLike | null = null;
  private syncing = false;
  private reconnectMs = 2000;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly sampleMs: number;
  private readonly historyMs: number;
  private readonly pollMs: number;
  private readonly maxLevels: number;

  constructor(
    readonly ticker: string,
    private readonly opts: FeedOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.sampleMs = opts.sampleMs ?? 1000;
    this.historyMs = opts.historyMs ?? 3 * 3600_000;
    this.pollMs = opts.pollMs ?? 2000;
    this.maxLevels = opts.maxLevels ?? 5000;
  }

  start(): void {
    this.connect();
    if (this.opts.timers !== false) {
      const t = setInterval(() => this.sample(), this.sampleMs);
      t.unref?.();
      this.timers.push(t);
    }
  }

  stop(): void {
    this.mode = "stopped";
    for (const t of this.timers) clearInterval(t);
    this.timers.length = 0;
    this.stopPolling();
    const s = this.socket;
    this.socket = null;
    if (s) (s.onclose = s.onerror = s.onmessage = s.onopen = null), s.close();
    this.listeners.clear();
  }

  /** Calls `fn` after every book change; returns the unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get synced(): boolean {
    return this.book.synced;
  }

  private connect(): void {
    if (this.mode === "stopped") return;
    const s = this.opts.socket(streamUrl(this.ticker));
    this.socket = s;
    s.onopen = () => {
      this.reconnectMs = 2000;
      this.stopPolling();
      this.mode = "stream";
      void this.resync();
    };
    s.onmessage = (ev) => {
      const d = parseDepthUpdate(ev.data);
      if (d) return this.handle(d);
      const t = parseStreamTrade(ev.data);
      if (t) this.trade(t);
    };
    s.onclose = s.onerror = () => {
      if (this.socket !== s) return;
      this.socket = null;
      s.onclose = s.onerror = s.onmessage = s.onopen = null;
      try {
        s.close();
      } catch {
        /* already closed */
      }
      if (this.mode === "stopped") return;
      this.mode = "poll";
      this.book.synced = false;
      this.startPolling();
      const t = setTimeout(() => this.connect(), this.reconnectMs);
      t.unref?.();
      this.timers.push(t);
      this.reconnectMs = Math.min(60_000, this.reconnectMs * 2);
    };
  }

  /** Feeds one stream update into the book (buffered while a snapshot loads). */
  handle(d: DepthDiff): void {
    if (this.mode !== "stream") return;
    if (!this.book.synced) {
      this.buffer.push(d);
      if (this.buffer.length > BUFFER_MAX) this.buffer.shift();
      // An earlier snapshot attempt failed: try again every 50 buffered updates.
      if (!this.syncing && this.buffer.length % 50 === 0) void this.resync();
      return;
    }
    const r = this.book.apply(d);
    if (r === "applied") {
      for (const [p, q] of d.bids) this.icebergs.level("bid", p, q);
      for (const [p, q] of d.asks) this.icebergs.level("ask", p, q);
      this.changed();
    }
    else if (r === "gap") {
      this.buffer = [d];
      void this.resync();
    }
  }

  /** Loads a snapshot and replays the buffered updates after it. Retries while it is older than them. */
  async resync(): Promise<void> {
    if (this.syncing || this.mode !== "stream") return;
    this.syncing = true;
    this.resyncs++;
    try {
      for (let attempt = 0; attempt < 5 && this.mode === "stream"; attempt++) {
        const snap = await this.opts.snapshot(this.ticker);
        if (this.mode !== "stream") return;
        const first = this.buffer.find((d) => d.u > snap.lastUpdateId);
        // The snapshot predates the oldest buffered update: updates in between are missing.
        if (first && first.U > snap.lastUpdateId + 1) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        this.book.load(snap);
        const pending = this.buffer;
        this.buffer = [];
        for (const d of pending) {
          if (this.book.apply(d) === "gap") {
            this.buffer = [];
            break;
          }
        }
        this.book.trim(this.maxLevels);
        this.seedIcebergs();
        if (this.book.synced) {
          this.changed();
          return;
        }
      }
    } catch {
      // Snapshot failed: the next update or poll tries again.
    } finally {
      this.syncing = false;
    }
  }

  private startPolling(): void {
    if (this.pollTimer || this.opts.timers === false) return;
    void this.pollOnce();
    this.pollTimer = setInterval(() => void this.pollOnce(), this.pollMs);
    this.pollTimer.unref?.();
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** While the stream is down: replace the book with a fresh REST snapshot. */
  async pollOnce(): Promise<void> {
    if (this.mode !== "poll") return;
    try {
      const snap = await this.opts.snapshot(this.ticker);
      if (this.mode !== "poll") return;
      this.book.load(snap);
      this.seedIcebergs();
      this.changed();
    } catch {
      /* keep the last book; the next poll tries again */
    }
  }

  /** Iceberg tracking starts over from the loaded book. */
  private seedIcebergs(): void {
    this.icebergs.reset();
    for (const [p, q] of this.book.bids) this.icebergs.level("bid", p, q);
    for (const [p, q] of this.book.asks) this.icebergs.level("ask", p, q);
  }

  /** One trade from the stream: iceberg detection against the current book (public for tests). */
  trade(t: FlowTrade): void {
    if (!this.book.synced) return;
    this.tradeSizes.push(t.qty);
    if (this.tradeSizes.length > 400) this.tradeSizes.splice(0, 200);
    if (this.tradeSizes.length % 50 === 0) {
      // Ignore levels where only a few typical trades went through: at least 10 median trades.
      const sorted = [...this.tradeSizes].sort((a, b) => a - b);
      this.icebergs.minSize = 10 * sorted[sorted.length >> 1];
    }
    const ev = this.icebergs.trade(t);
    if (ev) {
      this.events.push(ev);
      if (this.events.length > EVENTS_MAX) this.events.shift();
    }
  }

  /** Iceberg events with time (UTC seconds) in [from, to]. */
  flowEvents(from: number, to: number): FlowEvent[] {
    return this.events.filter((e) => e.time >= from && e.time <= to);
  }

  private changed(): void {
    this.updatedAt = this.now();
    if (this.book.bids.size > this.maxLevels * 1.2 || this.book.asks.size > this.maxLevels * 1.2) this.book.trim(this.maxLevels);
    for (const fn of this.listeners) fn();
  }

  /** Stores one heatmap frame (called by the sampler; public for tests). */
  sample(time = this.now()): DepthFrame | null {
    if (!this.book.synced) return null;
    const mid = this.book.mid();
    if (mid === null) return null;
    this.step ??= depthStep(mid);
    const f = depthFrame(this.book, time, this.step);
    if (!f) return null;
    this.frames.push(f);
    const cutoff = time - this.historyMs;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].time < cutoff) drop++;
    if (drop) this.frames.splice(0, drop);
    this.opts.onFrame?.(this.ticker, f);
    return f;
  }

  /** Stored frames with time in [from, to] (UTC ms), oldest first. */
  history(from: number, to: number): DepthFrame[] {
    return this.frames.filter((f) => f.time >= from && f.time <= to);
  }
}
