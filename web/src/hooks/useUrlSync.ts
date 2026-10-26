// URL deep links for the workspace. On load `?tab=` selects a tab, `?layout=` binds the active
// cell to that layout, and `?symbol=`/`?interval=` load into the active cell (and its link
// group). Afterwards the URL follows the active cell via replaceState (no history entries).

import { useEffect, useRef, useState } from "react";
import type { Layout } from "@qt/core";
import type { ActiveCellState } from "../components/workspace/ChartCell";
import { parseUrlState, serializeUrlState } from "../state/urlState";
import { activeCellOf, activeTabOf } from "../state/workspace";
import type { WorkspaceApi } from "./useWorkspace";

/** Returns true once the initial tab/layout parameters are applied (render the grid then). */
export function useUrlSync(api: WorkspaceApi, active: ActiveCellState | null, linkedUpdate: (index: number, fn: (l: Layout) => Layout) => void): boolean {
  const init = useRef(parseUrlState(window.location.search));
  // A URL the app wrote itself (reload) restores nothing: the workspace already holds that view.
  // Only links from outside load a symbol/interval. history.state survives reloads.
  const own = (window.history.state as { qtUrl?: string } | null)?.qtUrl === window.location.search;
  const pending = useRef(!own && (init.current.symbol || init.current.interval) ? { symbol: init.current.symbol, interval: init.current.interval } : null);
  const [ready, setReady] = useState(false);
  const { ws, dispatch, current } = api;

  useEffect(() => {
    if (!ws || ready) return;
    const u = init.current;
    if (u.tab && ws.tabs.some((t) => t.id === u.tab)) dispatch({ type: "select", tabId: u.tab });
    if (u.layout) {
      const tab = activeTabOf(current()!);
      dispatch({ type: "cellLayout", tabId: tab.id, index: activeCellOf(tab), layoutId: u.layout });
    }
    setReady(true);
  }, [ws, ready, dispatch, current]);

  // Symbol/interval from the URL, once the active cell has its layout.
  useEffect(() => {
    const p = pending.current;
    if (!p || !active || !ready) return;
    pending.current = null;
    linkedUpdate(active.index, (l) => ({ ...l, symbol: p.symbol ?? l.symbol, interval: p.interval ?? l.interval }));
  }, [active, ready, linkedUpdate]);

  const tabId = ws?.activeTab;
  const symbol = active?.layout.symbol;
  const interval = active?.layout.interval;
  useEffect(() => {
    if (!tabId || !symbol || !interval || pending.current) return;
    const loc = window.location;
    const next = serializeUrlState(loc.search, { tab: tabId, symbol, interval });
    if (next === loc.search && (window.history.state as { qtUrl?: string } | null)?.qtUrl === next) return;
    window.history.replaceState({ ...(window.history.state ?? {}), qtUrl: next }, "", `${loc.pathname}${next}${loc.hash}`);
  }, [tabId, symbol, interval]);

  return ready;
}
