// Workspace model: in-app tabs, each a grid of independent charts (one layout id per cell),
// plus link groups and crosshair sync. Pure: the reducer never creates ids itself (actions
// carry them), so it is deterministic and testable; `useWorkspace` adds loading and saving.

import type { GridKind, LinkColor, LinkGroup, Workspace, WorkspaceTab } from "@qt/core";
import { cellCount, defaultSizes, gridSpec, isGridKind, normalizeSizes } from "./grid";
import { groupFor, isLinkColor, normalizeLinkGroups, normalizeLinkValues, recordLinkChange, type LinkChange, type LinkValues } from "./links";

/** A tab as the web app keeps it: the shared contract plus the active cell. */
export type TabState = WorkspaceTab & { activeCell?: number };

export interface WorkspaceDoc extends Workspace {
  tabs: TabState[];
  /** Last linked symbol/interval per color, applied by cells of other tabs when they mount. */
  linkValues?: LinkValues;
}

export interface ClosedTab {
  tab: TabState;
  /** Position the tab had in the strip. */
  index: number;
}

export interface WsState {
  ws: WorkspaceDoc;
  /** Most recently closed last. */
  closed: ClosedTab[];
}

export const CLOSED_MAX = 20;
export const DEFAULT_TAB_ID = "t-default";
export const DEFAULT_LAYOUT_ID = "default";

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
export const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

export type WsAction =
  | { type: "select"; tabId: string }
  | { type: "selectIndex"; index: number }
  | { type: "cycle"; dir: 1 | -1 }
  | { type: "new"; tab: TabState }
  | { type: "close"; tabId: string; replacement?: TabState }
  | { type: "reopen" }
  | { type: "rename"; tabId: string; name: string }
  | { type: "duplicate"; tabId: string; newTabId: string; layoutIds: string[]; name?: string }
  | { type: "move"; from: number; to: number }
  | { type: "grid"; tabId: string; grid: GridKind; newLayoutIds: string[] }
  | { type: "sizes"; tabId: string; sizes: number[] }
  | { type: "activeCell"; tabId: string; index: number }
  | { type: "cellLink"; tabId: string; index: number; link?: LinkColor }
  | { type: "cellLayout"; tabId: string; index: number; layoutId: string }
  | { type: "linkGroup"; group: LinkGroup }
  | { type: "crosshairSync"; on: boolean }
  | { type: "timeSync"; on: boolean }
  | { type: "linkValue"; color: LinkColor; change: LinkChange; at: number }
  | { type: "replace"; ws: WorkspaceDoc };

export function makeTab(id: string, name: string, layoutId: string): TabState {
  return { id, name, grid: "1", cells: [{ layoutId }], sizes: defaultSizes("1"), activeCell: 0 };
}

/** A missing workspace: one tab, grid "1", bound to the "default" layout (single-chart users). */
export function defaultWorkspace(now = Date.now()): WorkspaceDoc {
  return {
    id: "default",
    tabs: [makeTab(DEFAULT_TAB_ID, "Chart 1", DEFAULT_LAYOUT_ID)],
    activeTab: DEFAULT_TAB_ID,
    linkGroups: normalizeLinkGroups(undefined),
    crosshairSync: false,
    updatedAt: now,
  };
}

function normalizeTab(raw: unknown, i: number): TabState | null {
  const t = raw as Partial<TabState> | null;
  if (!t || !isId(t.id)) return null;
  const grid: GridKind = isGridKind(t.grid) ? t.grid : "1";
  const cells = (Array.isArray(t.cells) ? t.cells : [])
    .filter((c) => c && isId(c.layoutId))
    .map((c) => (isLinkColor(c.link) ? { layoutId: c.layoutId, link: c.link } : { layoutId: c.layoutId }));
  if (cells.length < cellCount(grid)) return null;
  const n = cellCount(grid);
  const ac = typeof t.activeCell === "number" && t.activeCell >= 0 && t.activeCell < n ? Math.floor(t.activeCell) : 0;
  const name = typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 60) : `Chart ${i + 1}`;
  return { id: t.id, name, grid, cells, sizes: normalizeSizes(grid, t.sizes), activeCell: ac };
}

/** Validate a stored workspace; anything unusable falls back to the defaults. */
export function normalizeWorkspace(raw: unknown): WorkspaceDoc {
  const w = raw as Partial<WorkspaceDoc> | null;
  const d = defaultWorkspace();
  if (!w || typeof w !== "object") return d;
  const seen = new Set<string>();
  const tabs = (Array.isArray(w.tabs) ? w.tabs : [])
    .map(normalizeTab)
    .filter((t): t is TabState => t !== null && !seen.has(t.id) && (seen.add(t.id), true));
  if (tabs.length === 0) return { ...d, updatedAt: typeof w.updatedAt === "number" ? w.updatedAt : d.updatedAt };
  const linkValues = normalizeLinkValues(w.linkValues);
  return {
    id: isId(w.id) ? w.id : d.id,
    tabs,
    activeTab: tabs.some((t) => t.id === w.activeTab) ? (w.activeTab as string) : tabs[0].id,
    linkGroups: normalizeLinkGroups(w.linkGroups),
    crosshairSync: w.crosshairSync === true,
    ...(w.timeSync === true ? { timeSync: true } : {}),
    updatedAt: typeof w.updatedAt === "number" ? w.updatedAt : d.updatedAt,
    ...(linkValues ? { linkValues } : {}),
  };
}

export function activeTabOf(ws: WorkspaceDoc): TabState {
  return ws.tabs.find((t) => t.id === ws.activeTab) ?? ws.tabs[0];
}

export function activeCellOf(tab: TabState): number {
  const n = cellCount(tab.grid);
  return tab.activeCell != null && tab.activeCell >= 0 && tab.activeCell < n ? tab.activeCell : 0;
}

/** "Chart N" with the smallest N not used by another tab. */
export function nextTabName(ws: WorkspaceDoc): string {
  const used = new Set(ws.tabs.map((t) => t.name));
  for (let n = 1; ; n++) if (!used.has(`Chart ${n}`)) return `Chart ${n}`;
}

/** Layout ids a tab needs added to show `grid` (cells beyond the grid are kept for later). */
export function missingCells(tab: TabState, grid: GridKind): number {
  return Math.max(0, cellCount(grid) - tab.cells.length);
}

function mapTab(ws: WorkspaceDoc, tabId: string, fn: (t: TabState) => TabState): WorkspaceDoc {
  let changed = false;
  const tabs = ws.tabs.map((t) => {
    if (t.id !== tabId) return t;
    const n = fn(t);
    if (n !== t) changed = true;
    return n;
  });
  return changed ? { ...ws, tabs } : ws;
}

function insertAfterActive(ws: WorkspaceDoc, tab: TabState): WorkspaceDoc {
  const i = ws.tabs.findIndex((t) => t.id === ws.activeTab);
  const tabs = [...ws.tabs];
  tabs.splice(i < 0 ? tabs.length : i + 1, 0, tab);
  return { ...ws, tabs, activeTab: tab.id };
}

function withWs(s: WsState, ws: WorkspaceDoc): WsState {
  return ws === s.ws ? s : { ...s, ws };
}

export function workspaceReducer(s: WsState, a: WsAction): WsState {
  const ws = s.ws;
  switch (a.type) {
    case "select":
      return ws.activeTab === a.tabId || !ws.tabs.some((t) => t.id === a.tabId) ? s : withWs(s, { ...ws, activeTab: a.tabId });
    case "selectIndex": {
      // Like browsers, 9 (or any index past the end) means the last tab.
      const t = a.index >= ws.tabs.length - 1 || a.index >= 8 ? ws.tabs[ws.tabs.length - 1] : ws.tabs[Math.max(0, a.index)];
      return workspaceReducer(s, { type: "select", tabId: t.id });
    }
    case "cycle": {
      const n = ws.tabs.length;
      const i = ws.tabs.findIndex((t) => t.id === ws.activeTab);
      return workspaceReducer(s, { type: "select", tabId: ws.tabs[(i + a.dir + n) % n].id });
    }
    case "new":
      if (ws.tabs.some((t) => t.id === a.tab.id)) return s;
      return withWs(s, insertAfterActive(ws, a.tab));
    case "close": {
      const index = ws.tabs.findIndex((t) => t.id === a.tabId);
      if (index < 0) return s;
      const closed = [...s.closed, { tab: ws.tabs[index], index }].slice(-CLOSED_MAX);
      let tabs = ws.tabs.filter((t) => t.id !== a.tabId);
      if (tabs.length === 0) {
        if (!a.replacement) return s; // the last tab only closes when a fresh one replaces it
        tabs = [a.replacement];
      }
      const activeTab = ws.activeTab === a.tabId ? tabs[Math.min(index, tabs.length - 1)].id : ws.activeTab;
      return { ws: { ...ws, tabs, activeTab }, closed };
    }
    case "reopen": {
      const last = s.closed[s.closed.length - 1];
      if (!last) return s;
      const closed = s.closed.slice(0, -1);
      if (ws.tabs.some((t) => t.id === last.tab.id)) return { ...s, closed };
      const tabs = [...ws.tabs];
      tabs.splice(Math.min(last.index, tabs.length), 0, last.tab);
      return { ws: { ...ws, tabs, activeTab: last.tab.id }, closed };
    }
    case "rename": {
      const name = a.name.trim().slice(0, 60);
      if (!name) return s;
      return withWs(s, mapTab(ws, a.tabId, (t) => (t.name === name ? t : { ...t, name })));
    }
    case "duplicate": {
      const src = ws.tabs.find((t) => t.id === a.tabId);
      if (!src || ws.tabs.some((t) => t.id === a.newTabId) || a.layoutIds.length < src.cells.length) return s;
      const copy: TabState = {
        ...src,
        id: a.newTabId,
        name: (a.name ?? `${src.name} copy`).slice(0, 60),
        cells: src.cells.map((c, i) => ({ ...c, layoutId: a.layoutIds[i] })),
        sizes: src.sizes ? [...src.sizes] : undefined,
      };
      const i = ws.tabs.indexOf(src);
      const tabs = [...ws.tabs];
      tabs.splice(i + 1, 0, copy);
      return withWs(s, { ...ws, tabs, activeTab: copy.id });
    }
    case "move": {
      const n = ws.tabs.length;
      if (a.from === a.to || a.from < 0 || a.from >= n || a.to < 0 || a.to >= n) return s;
      const tabs = [...ws.tabs];
      const [t] = tabs.splice(a.from, 1);
      tabs.splice(a.to, 0, t);
      return withWs(s, { ...ws, tabs });
    }
    case "grid":
      return withWs(
        s,
        mapTab(ws, a.tabId, (t) => {
          if (t.grid === a.grid) return t;
          const need = missingCells(t, a.grid);
          if (a.newLayoutIds.length < need) return t;
          const cells = [...t.cells, ...a.newLayoutIds.slice(0, need).map((layoutId) => ({ layoutId }))];
          const n = cellCount(a.grid);
          const same = gridSpec(t.grid).cols === gridSpec(a.grid).cols && gridSpec(t.grid).rows === gridSpec(a.grid).rows;
          const sizes = same ? normalizeSizes(a.grid, t.sizes) : defaultSizes(a.grid);
          return { ...t, grid: a.grid, cells, sizes, activeCell: Math.min(activeCellOf(t), n - 1) };
        }),
      );
    case "sizes":
      return withWs(
        s,
        mapTab(ws, a.tabId, (t) => {
          const sizes = normalizeSizes(t.grid, a.sizes);
          return JSON.stringify(sizes) === JSON.stringify(t.sizes) ? t : { ...t, sizes };
        }),
      );
    case "activeCell":
      return withWs(
        s,
        mapTab(ws, a.tabId, (t) => (a.index < 0 || a.index >= cellCount(t.grid) || t.activeCell === a.index ? t : { ...t, activeCell: a.index })),
      );
    case "cellLink":
      return withWs(
        s,
        mapTab(ws, a.tabId, (t) => {
          const c = t.cells[a.index];
          if (!c || c.link === a.link) return t;
          const cells = [...t.cells];
          cells[a.index] = a.link ? { layoutId: c.layoutId, link: a.link } : { layoutId: c.layoutId };
          return { ...t, cells };
        }),
      );
    case "cellLayout":
      if (!isId(a.layoutId)) return s;
      return withWs(
        s,
        mapTab(ws, a.tabId, (t) => {
          const c = t.cells[a.index];
          if (!c || c.layoutId === a.layoutId) return t;
          const cells = [...t.cells];
          cells[a.index] = { ...c, layoutId: a.layoutId };
          return { ...t, cells };
        }),
      );
    case "linkGroup": {
      const old = ws.linkGroups.find((g) => g.color === a.group.color);
      if (old && old.symbol === a.group.symbol && old.interval === a.group.interval && old.time === a.group.time) return s;
      return withWs(s, { ...ws, linkGroups: normalizeLinkGroups([a.group, ...ws.linkGroups.filter((g) => g.color !== a.group.color)]) });
    }
    case "crosshairSync":
      return ws.crosshairSync === a.on ? s : withWs(s, { ...ws, crosshairSync: a.on });
    case "timeSync": {
      if ((ws.timeSync === true) === a.on) return s;
      const { timeSync: _off, ...rest } = ws;
      return withWs(s, a.on ? { ...rest, timeSync: true } : rest);
    }
    case "linkValue": {
      const linkValues = recordLinkChange(ws.linkValues, groupFor(ws.linkGroups, a.color), a.change, a.at);
      return linkValues === ws.linkValues || (ws.linkValues === undefined && Object.keys(linkValues).length === 0) ? s : withWs(s, { ...ws, linkValues });
    }
    case "replace":
      return withWs(s, a.ws);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const FIELDS = ["tabs", "activeTab", "linkGroups", "crosshairSync", "linkValues"] as const;

/**
 * Three-way merge after a save conflict: fields this browser tab changed since `base` win,
 * everything else comes from the newer stored `remote`.
 */
export function mergeWorkspaces(base: WorkspaceDoc, local: WorkspaceDoc, remote: WorkspaceDoc): WorkspaceDoc {
  const out: WorkspaceDoc = { ...remote };
  for (const k of FIELDS) if (!same(base[k], local[k])) (out as unknown as Record<string, unknown>)[k] = local[k];
  if (!out.tabs.some((t) => t.id === out.activeTab)) out.activeTab = out.tabs[0].id;
  return out;
}

/**
 * Follow another browser tab's save but keep what this browser tab looks at: its active tab
 * (when it still exists) and each tab's active cell.
 */
export function adoptRemote(local: WorkspaceDoc, remote: WorkspaceDoc): WorkspaceDoc {
  const active = new Map(local.tabs.map((t) => [t.id, t.activeCell]));
  const tabs = remote.tabs.map((t) => {
    const ac = active.get(t.id);
    return ac != null && ac < cellCount(t.grid) && ac !== t.activeCell ? { ...t, activeCell: ac } : t;
  });
  return { ...remote, tabs, activeTab: tabs.some((t) => t.id === local.activeTab) ? local.activeTab : remote.activeTab };
}
