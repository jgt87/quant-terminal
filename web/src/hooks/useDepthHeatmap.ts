// Liquidity heatmap data for a chart (Binance symbols).
// Live: the order book frames the server has for the loaded time range (memory, plus disk when
// the pair is recorded), then new frames every two seconds. The server starts its order book feed
// on the first request, so without recording the heatmap begins when it is turned on.
// Bar Replay: recorded frames around the replay cursor; the engine draws those up to the replay
// clock, and the window is reloaded when the cursor leaves it.

import { useEffect } from "react";
import { thinFrames, type DepthFrame } from "@qt/core";
import { fetchDepthHistory, fetchRecordedDepth } from "../api/depth";
import type { ChartEngine } from "../chart/ChartEngine";

const POLL_MS = 2000;
const INITIAL_MAX = 3000;
/** Frames kept on the client; older ones are thinned when it is exceeded. */
const KEEP_MAX = 6000;
/** Replay window: bars before and after the cursor loaded at once. */
const REPLAY_BACK_BARS = 300;
const REPLAY_AHEAD_BARS = 60;

export function useDepthHeatmap(engine: ChartEngine | null, symbol: string, on: boolean, provider: string | undefined, ready: boolean): void {
  const active = Boolean(engine) && ready && on && provider === "binance";
  useEffect(() => {
    if (!engine) return;
    if (!active) {
      engine.setDepthFrames([]);
      return;
    }
    let alive = true;
    let frames: DepthFrame[] = [];
    let lastTime = 0;
    /** Replay window loaded (UTC seconds), null in live mode. */
    let window_: { from: number; to: number } | null = null;
    let gen = 0;

    const pushLive = (add: readonly DepthFrame[]) => {
      if (!alive || !add.length) return;
      frames = frames.concat(add.filter((f) => f.time > lastTime));
      if (frames.length > KEEP_MAX) frames = [...thinFrames(frames.slice(0, -1000), KEEP_MAX - 2000), ...frames.slice(-1000)];
      lastTime = frames[frames.length - 1]?.time ?? lastTime;
      engine.setDepthFrames(frames);
    };
    const loadLive = async () => {
      const my = ++gen;
      frames = [];
      lastTime = 0;
      const bars = engine.raw.bars;
      const from = bars.length ? bars[0].time * 1000 : Date.now() - 3 * 3600_000;
      const r = await fetchDepthHistory(symbol, from, Date.now() + 60_000, INITIAL_MAX);
      if (my === gen) pushLive(r.frames);
    };
    const pollLive = async () => {
      const r = await fetchDepthHistory(symbol, lastTime + 1, Date.now() + 60_000, 500);
      if (!window_) pushLive(r.frames);
    };
    const loadReplay = async (cursor: number) => {
      const my = ++gen;
      const sec = engine.meta.intervalSec || 60;
      const from = cursor - REPLAY_BACK_BARS * sec;
      const to = cursor + REPLAY_AHEAD_BARS * sec;
      window_ = { from, to };
      const r = await fetchRecordedDepth(symbol, from * 1000, to * 1000, 4000);
      if (!alive || my !== gen) return;
      frames = r.frames;
      engine.setDepthFrames(frames);
    };

    let busy = false;
    const run = (fn: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      void fn()
        .catch(() => {
          /* the heatmap is optional: keep the chart working without it */
        })
        .finally(() => (busy = false));
    };
    const onReplay = () => {
      const r = engine.replay;
      if (r.phase === "on" && r.cursor != null) {
        const sec = engine.meta.intervalSec || 60;
        const w = window_;
        if (!w || r.cursor < w.from || r.cursor > w.to - 10 * sec) {
          busy = false;
          run(() => loadReplay(r.cursor!));
        }
      } else if (window_) {
        window_ = null;
        busy = false;
        run(loadLive);
      }
    };
    const off = engine.events.on("replay", onReplay);
    if (engine.replay.phase === "on") onReplay();
    else run(loadLive);
    const timer = window.setInterval(() => !window_ && run(pollLive), POLL_MS);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
    };
  }, [engine, active, symbol]);
}
