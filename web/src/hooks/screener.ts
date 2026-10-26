// Screener state: universes, last result, run (latest request wins) and auto-refresh.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenerRequest } from "@qt/core";
import { isAbort } from "../api/client";
import { errorText } from "../api/http";
import { listUniverses, runScreener, type ScreenerResult, type UniverseInfo } from "../api/screener";

export function useScreener(refreshMs: number) {
  const [universes, setUniverses] = useState<UniverseInfo[]>([]);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const last = useRef<ScreenerRequest | null>(null);

  useEffect(() => {
    listUniverses()
      .then(setUniverses)
      .catch((e) => setError(errorText(e)));
    return () => ctrl.current?.abort();
  }, []);

  const run = useCallback(async (req: ScreenerRequest) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    last.current = req;
    setLoading(true);
    try {
      const r = await runScreener(req, c.signal);
      setResult(r);
      setError(null);
    } catch (e) {
      if (!isAbort(e)) setError(errorText(e));
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!refreshMs) return;
    const t = window.setInterval(() => {
      if (last.current && document.visibilityState === "visible") void run(last.current);
    }, refreshMs);
    return () => window.clearInterval(t);
  }, [refreshMs, run]);

  return { universes, result, loading, error, run };
}
