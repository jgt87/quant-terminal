// Glue between the workspace model and the mounted chart cells: the active cell, link-group
// propagation, crosshair/time sync, maximize, and the tab/grid actions that create layouts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, GridKind, Layout, LinkColor, LinkGroup } from "@qt/core";
import { drawingPrefs } from "../state/drawingPrefs";
import { getLayout, putLayout } from "../api/client";
import type { ActiveCellState, CellContext } from "../components/workspace/ChartCell";
import type { MenuItem } from "../components/menuTypes";
import { CellHub } from "../state/cellHub";
import { cellCount } from "../state/grid";
import { uid } from "../state/layoutDefaults";
import { seedLayout } from "../state/layoutSeeds";
import { changeOf, crosshairTargets, groupFor, isEmptyChange, joinPatch, linkTargets, mountPatch, timeTargets } from "../state/links";
import { activeCellOf, activeTabOf, makeTab, missingCells, nextTabName } from "../state/workspace";
import type { WorkspaceApi } from "./useWorkspace";

export interface ShellDialogs {
  openMenu(x: number, y: number, items: MenuItem[]): void;
  openSearch(initial: string): void;
  openText(id: string, text: string): void;
  openDrawingSettings(id: string): void;
  openIndicatorSettings(uid: string): void;
  openChartSettings(): void;
  /** Closing the last tab asks first (the app's own confirm dialog). */
  confirmCloseLast(tabId: string): void;
}

export function useWorkspaceShell(api: WorkspaceApi, dialogs: ShellDialogs) {
  const { dispatch, current } = api;
  const hub = useMemo(() => new CellHub(), []);
  const [active, setActive] = useState<ActiveCellState | null>(null);
  const [maximized, setMaximized] = useState<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const dlg = useRef(dialogs);
  dlg.current = dialogs;

  const activeTab = () => {
    const ws = current();
    return ws ? { ws, tab: activeTabOf(ws) } : null;
  };

  const report = useCallback((index: number, s: ActiveCellState | null) => {
    setActive((cur) => (s ? s : cur && cur.index === index ? null : cur));
  }, []);

  const activate = useCallback(
    (index: number) => {
      const ws = current();
      if (!ws) return;
      const tab = activeTabOf(ws);
      if (activeCellOf(tab) !== index) dispatch({ type: "activeCell", tabId: tab.id, index });
    },
    [current, dispatch],
  );

  /**
   * Update one cell's layout and push symbol/interval changes to its link group in the same
   * event (React batches them into one render). Targets get raw updates, so nothing loops.
   */
  const linkedUpdate = useCallback(
    (index: number, fn: (l: Layout) => Layout) => {
      const h = hub.get(index);
      if (!h) return;
      const prev = h.layout();
      h.update(fn);
      const ws = current();
      if (!prev || !ws) return;
      const change = changeOf(prev, fn(prev));
      if (isEmptyChange(change)) return;
      const tab = activeTabOf(ws);
      const n = cellCount(tab.grid);
      for (const u of linkTargets(tab.cells, n, ws.linkGroups, index, change, hub.values(n))) {
        hub.get(u.index)?.update((l) => ({ ...l, ...u.patch }));
      }
      // Cells of other tabs (not mounted) pick the change up when they mount.
      const color = tab.cells[index]?.link;
      if (color) dispatch({ type: "linkValue", color, change, at: Date.now() });
    },
    [current, dispatch, hub],
  );

  /** A cell's layout loaded: adopt its link group's newer values set while it was not mounted. */
  const cellReady = useCallback(
    (index: number) => {
      const ws = current();
      const h = hub.get(index);
      const l = h?.layout();
      if (!ws || !h || !l) return;
      const color = activeTabOf(ws).cells[index]?.link;
      if (!color) return;
      const patch = mountPatch(ws.linkValues?.[color], groupFor(ws.linkGroups, color), l, l.updatedAt ?? 0);
      if (!isEmptyChange(patch)) h.update((x) => ({ ...x, ...patch }));
    },
    [current, hub],
  );

  const crosshair = useCallback(
    (index: number, time: number | null) => {
      const ws = current();
      if (!ws?.crosshairSync) return;
      const tab = activeTabOf(ws);
      for (const i of crosshairTargets(tab.cells, cellCount(tab.grid), index)) hub.get(i)?.engine()?.setExternalCrosshair(time);
    },
    [current, hub],
  );

  const viewChange = useCallback(
    (index: number, r: { from: number; to: number }) => {
      const ws = current();
      if (!ws) return;
      const tab = activeTabOf(ws);
      for (const i of timeTargets(tab.cells, cellCount(tab.grid), ws.linkGroups, index, ws.timeSync === true)) hub.get(i)?.engine()?.setVisibleTimeRange(r.from, r.to);
    },
    [current, hub],
  );

  const toggleMaximize = useCallback(
    (index: number) => {
      activate(index);
      setMaximized((m) => (m === index ? null : index));
    },
    [activate],
  );

  const setLink = useCallback(
    (index: number, color: LinkColor | undefined) => {
      const ws = current();
      if (!ws) return;
      const tab = activeTabOf(ws);
      dispatch({ type: "cellLink", tabId: tab.id, index, link: color });
      if (!color) return;
      // Joining a group adopts the group's symbol (and interval when linked).
      const n = cellCount(tab.grid);
      const cells = tab.cells.map((c, i) => (i === index ? { ...c, link: color } : c));
      const patch = joinPatch(cells, n, ws.linkGroups, index, color, hub.values(n));
      if (!isEmptyChange(patch)) hub.get(index)?.update((l) => ({ ...l, ...patch }));
    },
    [current, dispatch, hub],
  );

  const setGroup = useCallback((group: LinkGroup) => dispatch({ type: "linkGroup", group }), [dispatch]);

  /** "Sync drawings": mirror a cell's drawing list to the other charts of the same symbol in the tab. */
  const drawingsChanged = useCallback(
    (index: number, symbol: string, list: Drawing[]) => {
      if (!drawingPrefs().syncDrawings) return;
      const ws = current();
      if (!ws) return;
      const n = cellCount(activeTabOf(ws).grid);
      for (let i = 0; i < n; i++) {
        const h = i === index ? undefined : hub.get(i);
        if (!h || h.layout()?.symbol !== symbol) continue;
        h.update((l) => (l.symbol === symbol ? { ...l, drawings: { ...l.drawings, [symbol]: list } } : l));
        h.engine()?.drawings.replaceAll(list);
      }
    },
    [current, hub],
  );

  const ctx: CellContext = useMemo(
    () => ({
      hub,
      activate,
      report,
      linkedUpdate,
      cellReady,
      crosshair,
      viewChange,
      toggleMaximize,
      setLink,
      setGroup,
      drawingsChanged,
      openMenu: (x, y, items) => dlg.current.openMenu(x, y, items),
      openSearch: (s) => dlg.current.openSearch(s),
      openText: (id, text) => dlg.current.openText(id, text),
      openDrawingSettings: (id) => dlg.current.openDrawingSettings(id),
      openIndicatorSettings: (u) => dlg.current.openIndicatorSettings(u),
      openChartSettings: () => dlg.current.openChartSettings(),
    }),
    [hub, activate, report, linkedUpdate, cellReady, crosshair, viewChange, toggleMaximize, setLink, setGroup],
  );

  // Crosshair sync off: clear every mirrored crosshair at once.
  const sync = api.ws?.crosshairSync ?? false;
  useEffect(() => {
    if (!sync) for (const e of hub.engines()) e.setExternalCrosshair(null);
  }, [sync, hub]);

  // A different tab or grid restores the grid view.
  const tabKey = api.ws ? `${api.ws.activeTab}:${activeTabOf(api.ws).grid}` : "";
  useEffect(() => setMaximized(null), [tabKey]);

  /** New layouts start on the active chart's symbol and interval. */
  const seedFromActive = (id: string) => {
    const l = activeRef.current?.layout;
    if (l) seedLayout(id, { symbol: l.symbol, interval: l.interval });
  };

  const newTab = useCallback(() => {
    const ws = current();
    if (!ws) return;
    const layoutId = uid("c");
    seedFromActive(layoutId);
    dispatch({ type: "new", tab: makeTab(uid("t"), nextTabName(ws), layoutId) });
  }, [current, dispatch]);

  const closeTab = useCallback(
    (tabId: string, confirmed = false) => {
      const ws = current();
      if (!ws) return;
      if (ws.tabs.length > 1) return dispatch({ type: "close", tabId });
      if (!confirmed) return dlg.current.confirmCloseLast(tabId);
      const layoutId = uid("c");
      seedFromActive(layoutId);
      dispatch({ type: "close", tabId, replacement: makeTab(uid("t"), "Chart 1", layoutId) });
    },
    [current, dispatch],
  );

  /** Duplicate copies the layout of every cell into a new layout id first. */
  const duplicateTab = useCallback(
    async (tabId: string) => {
      const ws = current();
      const src = ws?.tabs.find((t) => t.id === tabId);
      if (!ws || !src) return;
      const ids = src.cells.map(() => uid("c"));
      await Promise.all(
        src.cells.map(async (c, i) => {
          const mounted = tabId === ws.activeTab ? hub.get(i)?.layout() : null;
          const l = mounted && mounted.id === c.layoutId ? mounted : await getLayout(c.layoutId).catch(() => null);
          if (!l) return;
          const copy: Layout = { ...l, id: ids[i], updatedAt: Date.now() };
          seedLayout(ids[i], copy);
          await putLayout(copy).catch(() => undefined);
        }),
      );
      dispatch({ type: "duplicate", tabId, newTabId: uid("t"), layoutIds: ids });
    },
    [current, dispatch, hub],
  );

  const setGrid = useCallback(
    (grid: GridKind) => {
      const t = activeTab();
      if (!t) return;
      const ids = Array.from({ length: missingCells(t.tab, grid) }, () => uid("c"));
      ids.forEach(seedFromActive);
      dispatch({ type: "grid", tabId: t.tab.id, grid, newLayoutIds: ids });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, dispatch],
  );

  /** Time sync was turned on: show the active chart's visible range on every chart of the tab. */
  const alignTime = useCallback(() => {
    const ws = current();
    if (!ws) return;
    const tab = activeTabOf(ws);
    const index = activeCellOf(tab);
    const r = hub.get(index)?.engine()?.visibleTimeRange();
    if (!r) return;
    for (const i of timeTargets(tab.cells, cellCount(tab.grid), ws.linkGroups, index, true)) hub.get(i)?.engine()?.setVisibleTimeRange(r.from, r.to);
  }, [current, hub]);

  return { hub, ctx, active, maximized, linkedUpdate, toggleMaximize, newTab, closeTab, duplicateTab, setGrid, alignTime };
}
