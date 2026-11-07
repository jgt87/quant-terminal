// Order book recording: heatmap frames of the recorded pairs appended to one JSON-lines file per
// pair and UTC day (`<dir>/<PAIR>/<YYYY-MM-DD>.jsonl`), at most one frame per `everyMs`. Frames
// are stored sparse (only bins with resting size) to keep the files small.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { DepthFrame } from "@qt/core";

/** One stored line: time, step, base, bin count, best bid / ask, [bin, size] pairs. */
interface StoredFrame {
  t: number;
  s: number;
  b: number;
  n: number;
  bid: number | null;
  ask: number | null;
  q: [number, number][];
}

export const encodeFrame = (f: DepthFrame): StoredFrame => ({
  t: f.time,
  s: f.step,
  b: f.base,
  n: f.qty.length,
  bid: f.bid,
  ask: f.ask,
  q: f.qty.flatMap((q, i): [number, number][] => (q > 0 ? [[i, q]] : [])),
});

export function decodeFrame(raw: unknown): DepthFrame | null {
  const r = raw as StoredFrame;
  if (!r || typeof r.t !== "number" || typeof r.s !== "number" || typeof r.b !== "number" || !Array.isArray(r.q)) return null;
  const n = Math.max(0, Math.min(5000, Math.floor(r.n) || 0));
  const qty = new Array<number>(n).fill(0);
  for (const pair of r.q) {
    if (!Array.isArray(pair)) continue;
    const [i, q] = pair;
    if (Number.isInteger(i) && i >= 0 && i < n && Number.isFinite(q)) qty[i] = q;
  }
  return { time: r.t, step: r.s, base: r.b, qty, bid: r.bid ?? null, ask: r.ask ?? null };
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;
/** Most days one read may cover. */
export const MAX_READ_DAYS = 7;

export class DepthRecorder {
  private readonly last = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    readonly dir: string,
    readonly everyMs = 5000,
  ) {}

  private file(ticker: string, ms: number): string {
    if (!/^[A-Z0-9]{2,30}$/.test(ticker)) throw new Error(`Invalid pair: ${ticker}`);
    return path.join(this.dir, ticker, `${day(ms)}.jsonl`);
  }

  /** Appends a frame unless one was written less than `everyMs` ago. Returns the write. */
  write(ticker: string, f: DepthFrame): Promise<void> | null {
    const prev = this.last.get(ticker);
    if (prev !== undefined && f.time - prev < this.everyMs) return null;
    this.last.set(ticker, f.time);
    const file = this.file(ticker, f.time);
    const line = `${JSON.stringify(encodeFrame(f))}\n`;
    const job = (this.queues.get(file) ?? Promise.resolve())
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, line, "utf8");
      })
      .catch(() => {
        /* a failed write loses one frame; recording goes on */
      });
    this.queues.set(file, job);
    return job;
  }

  /** Recorded frames with time in [from, to] (UTC ms), oldest first, at most the last 7 days of the range. */
  async read(ticker: string, from: number, to: number): Promise<DepthFrame[]> {
    const start = Math.max(from, to - MAX_READ_DAYS * DAY_MS);
    const out: DepthFrame[] = [];
    for (let d = Math.floor(start / DAY_MS) * DAY_MS; d <= to; d += DAY_MS) {
      const file = this.file(ticker, d);
      await this.queues.get(file);
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (!line) continue;
        let f: DepthFrame | null = null;
        try {
          f = decodeFrame(JSON.parse(line));
        } catch {
          /* a torn last line after a crash */
        }
        if (f && f.time >= start && f.time <= to) out.push(f);
      }
    }
    return out.sort((a, b) => a.time - b.time);
  }
}
