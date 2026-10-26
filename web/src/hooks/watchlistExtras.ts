// Screener fields for watchlist symbols (custom columns), refreshed every few minutes.

import { useEffect, useState } from "react";
import type { ScreenerField, ScreenerRow } from "@qt/core";
import { isAbort } from "../api/client";
import { runScreener } from "../api/screener";
import meta from "../panels/watchlist/columns.json";

export function useScreenerValues(symbols: string[], fields: ScreenerField[]): Map<string, ScreenerRow["values"]> {
  const [values, setValues] = useState<Map<string, ScreenerRow["values"]>>(new Map());
  const symKey = symbols.join(",");
  const fieldKey = fields.join(",");
  useEffect(() => {
    if (!symKey || !fieldKey) return;
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const r = await runScreener({ universe: "custom", symbols: symKey.split(","), filters: [], columns: fieldKey.split(",") as ScreenerField[] }, ctrl.signal);
        setValues(new Map(r.rows.map((row) => [row.symbol, row.values])));
      } catch (e) {
        if (!isAbort(e)) setValues((v) => v);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), meta.screenerRefreshMs);
    return () => {
      ctrl.abort();
      window.clearInterval(t);
    };
  }, [symKey, fieldKey]);
  return values;
}
