// Loads the workspace (tabs, grids, links) and autosaves it, debounced. Same pattern as layouts:
// saves carry the updatedAt this browser tab started from, a 409 merges this tab's changes onto
// the newer stored workspace, and saves are announced on a BroadcastChannel so other browser
// tabs follow (each keeps its own active tab and active cells).

import { useCallback, useEffect, useRef, useState } from "react";
import { conflictWorkspace, loadWorkspace, saveWorkspace, workspaceStore, type WorkspaceStore } from "../api/workspace";
import settings from "../config/settings.json";
import {
  adoptRemote,
  CLOSED_MAX,
  defaultWorkspace,
  mergeWorkspaces,
  normalizeWorkspace,
  workspaceReducer,
  type ClosedTab,
  type WorkspaceDoc,
  type WsAction,
  type WsState,
} from "../state/workspace";

interface SyncMessage {
  type: "saved";
  ws: WorkspaceDoc;
  from: string;
}

const TAB_ID = Math.random().toString(36).slice(2);
const CLOSED_KEY = "qt.workspace.closed";
const ACTIVE_CELLS_KEY = "qt.workspace.activeCells";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Workspace content without the per-browser-tab view (active tab, active cells). */
function contentKey(ws: WorkspaceDoc): string {
  return JSON.stringify([ws.tabs.map((t) => ({ ...t, activeCell: undefined })), ws.linkGroups, ws.crosshairSync]);
}

/** The server keeps only the shared contract: active cells are restored from this browser. */
function withLocalActiveCells(raw: unknown): WorkspaceDoc {
  const map = readJson<Record<string, number>>(ACTIVE_CELLS_KEY, {});
  const w = raw as { tabs?: { id?: string; activeCell?: number }[] } | null;
  if (!w || !Array.isArray(w.tabs)) return normalizeWorkspace(raw);
  return normalizeWorkspace({
    ...w,
    tabs: w.tabs.map((t) => (t && t.activeCell == null && t.id && typeof map[t.id] === "number" ? { ...t, activeCell: map[t.id] } : t)),
  });
}

export interface WorkspaceApi {
  ws: WorkspaceDoc | null;
  closedCount: number;
  store: WorkspaceStore;
  dispatch(action: WsAction): void;
  /** Synchronous view of the latest state (after dispatches of the current event). */
  current(): WorkspaceDoc | null;
}

export function useWorkspace(): WorkspaceApi {
  const [state, setState] = useState<WsState | null>(null);
  const [store, setStore] = useState<WorkspaceStore>("server");
  const stateRef = useRef<WsState | null>(null);
  const base = useRef<WorkspaceDoc | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const channel = useRef<BroadcastChannel | null>(null);

  const commit = useCallback((next: WsState) => {
    const prev = stateRef.current;
    stateRef.current = next;
    setState(next);
    if (!prev) return;
    if (prev.closed !== next.closed) writeJson(CLOSED_KEY, next.closed);
    // localStorage is shared by every browser tab: record only the active cells this tab changed
    // (never another tab's view adopted over the BroadcastChannel).
    const before = new Map(prev.ws.tabs.map((t) => [t.id, t.activeCell]));
    const changed = next.ws.tabs.filter((t) => before.has(t.id) && before.get(t.id) !== t.activeCell);
    if (changed.length) {
      const map = readJson<Record<string, number>>(ACTIVE_CELLS_KEY, {});
      for (const t of changed) map[t.id] = t.activeCell ?? 0;
      const live = new Set([...next.ws.tabs.map((t) => t.id), ...next.closed.map((c) => c.tab.id)]);
      writeJson(ACTIVE_CELLS_KEY, Object.fromEntries(Object.entries(map).filter(([id]) => live.has(id))));
    }
  }, []);

  const saveRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveRef.current(), settings.autosaveDebounceMs);
  }, []);

  /** Adopt a newer stored workspace, keeping this tab's unsaved changes and its view. */
  const adopt = useCallback(
    (remoteRaw: unknown) => {
      const s = stateRef.current;
      const remote = normalizeWorkspace(remoteRaw);
      const b = base.current;
      if (!s || (b && remote.updatedAt <= b.updatedAt)) return;
      const merged = dirty.current && b ? mergeWorkspaces(b, s.ws, remote) : remote;
      base.current = remote;
      const next = adoptRemote(s.ws, merged);
      commit({ ...s, ws: next });
      // Only real content differences need a save; each browser tab's own view (active tab and
      // cells) never does, otherwise two tabs would keep answering each other's saves.
      dirty.current = contentKey(next) !== contentKey(remote);
      if (dirty.current) schedule();
    },
    [commit, schedule],
  );

  saveRef.current = () => {
    const s = stateRef.current;
    if (!s || !dirty.current || saving.current) return; // a running save re-checks `dirty` when done
    dirty.current = false;
    saving.current = true;
    const doc: WorkspaceDoc = { ...s.ws, updatedAt: Math.max(Date.now(), (base.current?.updatedAt ?? 0) + 1) };
    saveWorkspace(doc, base.current?.updatedAt)
      .then((stored) => {
        base.current = normalizeWorkspace(stored);
        setStore(workspaceStore());
        channel.current?.postMessage({ type: "saved", ws: base.current, from: TAB_ID } satisfies SyncMessage);
      })
      .catch((e) => {
        dirty.current = true;
        const remote = conflictWorkspace(e);
        if (remote) adopt(remote);
      })
      .finally(() => {
        saving.current = false;
        if (dirty.current) schedule();
      });
  };

  useEffect(() => {
    let cancelled = false;
    loadWorkspace()
      .then((raw) => {
        if (cancelled) return;
        setStore(workspaceStore());
        const ws = raw ? withLocalActiveCells(raw) : defaultWorkspace();
        base.current = raw ? normalizeWorkspace(raw) : null;
        const closed = readJson<ClosedTab[]>(CLOSED_KEY, []).filter((c) => c && c.tab && typeof c.index === "number").slice(-CLOSED_MAX);
        commit({ ws, closed });
        if (!raw) {
          dirty.current = true; // first run: store the migrated single-chart workspace
          schedule();
        }
      })
      .catch(() => {
        if (!cancelled) commit({ ws: defaultWorkspace(), closed: [] });
      });

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("qt-workspace");
      ch.onmessage = (ev: MessageEvent<SyncMessage>) => {
        const m = ev.data;
        if (m?.type === "saved" && m.from !== TAB_ID && m.ws) adopt(m.ws);
      };
    } catch {
      ch = null;
    }
    channel.current = ch;
    // Leaving the page: save now instead of after the debounce.
    const flush = () => {
      if (dirty.current) {
        window.clearTimeout(timer.current);
        saveRef.current();
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      cancelled = true;
      ch?.close();
      channel.current = null;
      window.removeEventListener("pagehide", flush);
      window.clearTimeout(timer.current);
    };
  }, [adopt, commit, schedule]);

  const dispatch = useCallback(
    (action: WsAction) => {
      const s = stateRef.current;
      if (!s) return;
      const next = workspaceReducer(s, action);
      if (next === s) return;
      commit(next);
      if (next.ws !== s.ws) {
        dirty.current = true;
        schedule();
      }
    },
    [commit, schedule],
  );

  const current = useCallback(() => stateRef.current?.ws ?? null, []);

  return { ws: state?.ws ?? null, closedCount: state?.closed.length ?? 0, store, dispatch, current };
}
