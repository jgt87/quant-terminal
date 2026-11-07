// Order book API (Binance symbols): current book, heatmap history and a live book stream.

import type { BookLevel, DepthFrame } from "@qt/core";
import { requestJson } from "./http";

export interface BookView {
  symbol: string;
  time: number;
  /** "replay": a recorded book shown during Bar Replay (client side only). */
  mode: "connecting" | "stream" | "poll" | "stopped" | "replay";
  synced: boolean;
  bid: number | null;
  ask: number | null;
  step: number;
  heatStep: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
}

const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

export const fetchBook = (symbol: string, levels = 100, step = 0) => requestJson<BookView>(`/api/depth?${q({ symbol, levels, step })}`);

/** Heatmap frames with time in [from, to] (UTC ms). */
export const fetchDepthHistory = (symbol: string, from: number, to: number, max = 2000) =>
  requestJson<{ symbol: string; step: number | null; mode: BookView["mode"]; frames: DepthFrame[] }>(`/api/depth/history?${q({ symbol, from, to, max })}`);

/** Recorded frames only (depth replay), time in [from, to] (UTC ms). */
export const fetchRecordedDepth = (symbol: string, from: number, to: number, max = 2000) =>
  requestJson<{ symbol: string; frames: DepthFrame[] }>(`/api/depth/recorded?${q({ symbol, from, to, max })}`);

/**
 * Live book updates (at most 4 per second). Reconnects on its own (EventSource); returns the
 * close function.
 */
export function streamBook(symbol: string, onBook: (b: BookView) => void, levels = 100, step = 0): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const es = new EventSource(`/api/depth/stream?${q({ symbol, levels, step })}`);
  es.addEventListener("book", (e) => {
    try {
      onBook(JSON.parse((e as MessageEvent<string>).data) as BookView);
    } catch {
      /* ignore a malformed frame */
    }
  });
  return () => es.close();
}

// Recorded pairs, cached for the (synchronous) chart menu. Loaded once and after each change.
let recorded = new Set<string>();
let recordedLoad: Promise<void> | null = null;
const pairKey = (symbol: string) => symbol.trim().toUpperCase().replace(/^BINANCE:/, "");

export function loadDepthRecordings(): Promise<void> {
  recordedLoad ??= requestJson<{ recordings: { symbol: string }[] }>("/api/depth/recording")
    .then((r) => void (recorded = new Set(r.recordings.map((x) => pairKey(x.symbol)))))
    .catch(() => {
      recordedLoad = null;
    });
  return recordedLoad;
}

/** Whether the symbol's order book is being recorded (as last loaded). */
export const isDepthRecording = (symbol: string): boolean => recorded.has(pairKey(symbol));

export async function setDepthRecording(symbol: string, on: boolean): Promise<void> {
  const r = await requestJson<{ recordings: { symbol: string }[] }>("/api/depth/recording", { method: "PUT", body: JSON.stringify({ symbol, on }) });
  recorded = new Set(r.recordings.map((x) => pairKey(x.symbol)));
}
