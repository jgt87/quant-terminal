// Live ticks for a set of MT5 symbols. All subscribers share one EventSource on /api/stream
// (see api/liveFeed); the browser reconnects on its own after drops. Polling stays the resync.

import { useEffect, useRef, useState } from "react";
import { tickFeed, type StreamState } from "../api/liveFeed";
import type { LiveTick } from "../chart/liveTick";

export type { StreamState };

export function useTickStream(symbols: string[], onTick: (t: LiveTick) => void): StreamState {
  const [state, setState] = useState<StreamState>("off");
  const cb = useRef(onTick);
  cb.current = onTick;
  const key = [...new Set(symbols)].sort().join(",");

  useEffect(() => {
    if (!key) {
      setState("off");
      return;
    }
    const off = tickFeed.subscribe(key.split(","), (t) => cb.current(t), setState);
    return () => {
      off();
      setState("off");
    };
  }, [key]);

  return state;
}
