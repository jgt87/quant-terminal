// Bar Replay cursor. The cursor is the time of the last revealed source bar, so history paging
// and live updates never move it; everything the chart computes is built from the revealed bars
// only (`revealBars`). Pure reducer.

import type { Bar } from "@qt/core";

export type ReplayPhase = "off" | "select" | "on";

export interface ReplayState {
  phase: ReplayPhase;
  /** Time of the last revealed bar (UTC seconds); null while selecting or off. */
  cursor: number | null;
  playing: boolean;
  /** Bars per second while playing. */
  speed: number;
  /** Tick mode: playing builds each next bar from its recorded ticks (Binance / MT5). */
  ticks?: boolean;
}

export const REPLAY_SPEEDS = [1, 2, 3, 5, 10] as const;
export const REPLAY_OFF: ReplayState = { phase: "off", cursor: null, playing: false, speed: 1 };

export type ReplayAction =
  | { type: "arm" }
  | { type: "start"; time: number; times: readonly number[] }
  | { type: "step"; n?: number; times: readonly number[] }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle"; times: readonly number[] }
  | { type: "speed"; value: number }
  | { type: "realtime"; times: readonly number[] }
  | { type: "ticks"; on: boolean }
  | { type: "exit" };

/** Number of bars with time <= t in sorted `times`. */
export function countAtOrBefore(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function atEnd(s: ReplayState, times: readonly number[]): boolean {
  return s.cursor == null || times.length === 0 || s.cursor >= times[times.length - 1];
}

const clampSpeed = (v: number) => Math.max(REPLAY_SPEEDS[0], Math.min(REPLAY_SPEEDS[REPLAY_SPEEDS.length - 1], v));

export function replayReducer(s: ReplayState, a: ReplayAction): ReplayState {
  switch (a.type) {
    case "arm":
      return { ...s, phase: "select", cursor: null, playing: false };
    case "start": {
      if (a.times.length === 0) return s;
      // Snap to the bar at or before the picked time (at least the first bar).
      const k = Math.max(1, countAtOrBefore(a.times, a.time));
      return { ...s, phase: "on", cursor: a.times[k - 1], playing: false };
    }
    case "step": {
      if (s.phase !== "on" || s.cursor == null) return s;
      const k = countAtOrBefore(a.times, s.cursor);
      const next = Math.min(a.times.length, k + Math.max(1, a.n ?? 1));
      if (next === 0) return s;
      const cursor = a.times[next - 1];
      const end = next >= a.times.length;
      return { ...s, cursor, playing: end ? false : s.playing };
    }
    case "play":
      return s.phase === "on" ? { ...s, playing: true } : s;
    case "pause":
      return { ...s, playing: false };
    case "toggle":
      if (s.phase !== "on") return s;
      if (!s.playing && atEnd(s, a.times)) return s;
      return { ...s, playing: !s.playing };
    case "speed":
      return { ...s, speed: clampSpeed(a.value) };
    case "realtime":
      if (s.phase !== "on" || a.times.length === 0) return s;
      return { ...s, cursor: a.times[a.times.length - 1], playing: false };
    case "ticks":
      return Boolean(s.ticks) === a.on ? s : { ...s, ticks: a.on };
    case "exit":
      return { ...REPLAY_OFF, speed: s.speed, ...(s.ticks ? { ticks: true } : {}) };
  }
}

/** One recorded tick: UTC milliseconds, price, size (0 when unknown). */
export interface ReplayTick {
  time: number;
  price: number;
  qty: number;
}

/** The bar opening at `time` as formed by its first `count` ticks (null before the first tick). */
export function formingBar(ticks: readonly ReplayTick[], count: number, time: number): Bar | null {
  const n = Math.min(count, ticks.length);
  if (n <= 0) return null;
  let high = -Infinity;
  let low = Infinity;
  let volume = 0;
  for (let i = 0; i < n; i++) {
    const p = ticks[i].price;
    if (p > high) high = p;
    if (p < low) low = p;
    volume += ticks[i].qty;
  }
  return { time, open: ticks[0].price, high, low, close: ticks[n - 1].price, volume };
}

/** Frames per bar in tick mode: two seconds per bar at 1×, shorter at higher speeds. */
export const TICK_FRAME_MS = 50;
export function tickStep(tickCount: number, speed: number): number {
  const frames = Math.max(1, Math.round(2000 / TICK_FRAME_MS / Math.max(1, speed)));
  return Math.max(1, Math.ceil(tickCount / frames));
}

/** Bars visible under the replay state: everything when off/selecting, else up to the cursor. */
export function revealBars<T extends Bar>(bars: readonly T[], s: ReplayState): readonly T[] {
  if (s.phase !== "on" || s.cursor == null) return bars;
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= s.cursor) lo = mid + 1;
    else hi = mid;
  }
  return lo === bars.length ? bars : bars.slice(0, lo);
}

/**
 * Replay clock (UTC ms): the end of the last revealed bar (the next bar's open), or the time of
 * the last tick shown while a bar forms; null when replay is off. Tick times may be ms or seconds.
 */
export function replayClock(s: ReplayState, times: readonly number[], intervalSec: number, lastTickTime?: number | null): number | null {
  if (s.phase !== "on" || s.cursor == null) return null;
  if (lastTickTime != null) return lastTickTime > 1e11 ? lastTickTime : lastTickTime * 1000;
  const k = countAtOrBefore(times, s.cursor);
  return (times[k] ?? s.cursor + intervalSec) * 1000;
}

/** The items with `time` (UTC ms) at or before `clock`, oldest first (all when clock is null). */
export function upToClock<T extends { time: number }>(items: readonly T[], clock: number | null): readonly T[] {
  if (clock === null) return items;
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time <= clock) lo = mid + 1;
    else hi = mid;
  }
  return lo === items.length ? items : items.slice(0, lo);
}
