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
    case "exit":
      return { ...REPLAY_OFF, speed: s.speed };
  }
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
