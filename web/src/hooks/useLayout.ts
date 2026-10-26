// Loads a layout (creating it on 404) and autosaves changes, debounced.
// Several tabs may show the same layout: saves carry the updatedAt this tab started from, a 409
// means another tab/device saved first and the newer layout is adopted (re-applying this tab's
// latest local change on top), and saves are announced on a BroadcastChannel so other tabs of
// this browser follow along live instead of overwriting each other.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Layout, LayoutConflict } from "@qt/core";
import { ApiError, getLayout, putLayout } from "../api/client";
import settings from "../config/settings.json";
import { defaultLayout, normalizeLayout } from "../state/layoutDefaults";
import { differsFrom, mergeLayouts } from "../state/layoutMerge";
import { dropLayoutSeed, layoutSeed } from "../state/layoutSeeds";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface SyncMessage {
  type: "saved";
  id: string;
  layout: Layout;
  from: string;
}

const TAB_ID = Math.random().toString(36).slice(2);

export function useLayout(id = "default") {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** The last layout this tab knows to be stored on the server. */
  const base = useRef<Layout | null>(null);
  const current = useRef<Layout | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const channel = useRef<BroadcastChannel | null>(null);
  current.current = layout;

  /** Adopt a newer stored layout, keeping this tab's unsaved local changes on top. */
  const adopt = useCallback((remote: Layout) => {
    const remoteN = normalizeLayout(remote);
    const b = base.current;
    if (b && remoteN.updatedAt <= b.updatedAt) return;
    base.current = remoteN;
    const local = current.current;
    if (!local || !b || !dirty.current) {
      dirty.current = false;
      current.current = remoteN;
      setLayout(remoteN);
      return;
    }
    const merged = mergeLayouts(b, local, remoteN);
    dirty.current = differsFrom(merged, remoteN);
    current.current = merged;
    setLayout(merged);
  }, []);

  const saveRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveRef.current(), settings.autosaveDebounceMs);
  }, []);

  saveRef.current = () => {
    const l = current.current;
    if (!l || !dirty.current || saving.current) return; // a running save re-checks `dirty` when done
    dirty.current = false;
    saving.current = true;
    setSaveState("saving");
    putLayout({ ...l, updatedAt: Date.now() }, base.current?.updatedAt)
      .then((stored) => {
        base.current = normalizeLayout(stored);
        setSaveState("saved");
        channel.current?.postMessage({ type: "saved", id, layout: stored, from: TAB_ID } satisfies SyncMessage);
      })
      .catch((e) => {
        dirty.current = true;
        const conflict = e instanceof ApiError && e.status === 409 ? (e.body as LayoutConflict | null)?.layout : undefined;
        if (conflict) {
          adopt(conflict);
          setSaveState("idle");
        } else setSaveState("error");
      })
      .finally(() => {
        saving.current = false;
        if (dirty.current) schedule();
      });
  };

  useEffect(() => {
    let cancelled = false;
    base.current = null;
    dirty.current = false;
    // A cell re-bound to another layout id must never save the previous layout under it.
    if (current.current && current.current.id !== id) {
      current.current = null;
      setLayout(null);
    }
    getLayout(id)
      .then((l) => {
        if (cancelled) return;
        const n = normalizeLayout(l);
        base.current = n;
        setLayout(n);
      })
      .catch((e) => {
        if (cancelled) return;
        // A layout the workspace just created (new tab/cell, duplicate) starts from its seed.
        const fresh = normalizeLayout({ ...defaultLayout(), ...layoutSeed(id), id, updatedAt: Date.now() });
        setLayout(fresh);
        if (e instanceof ApiError && e.status === 404) {
          putLayout(fresh)
            .then((stored) => {
              dropLayoutSeed(id);
              if (!cancelled && !base.current) base.current = normalizeLayout(stored);
            })
            .catch(() => setSaveState("error"));
        }
      });

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("qt-layouts");
      ch.onmessage = (ev: MessageEvent<SyncMessage>) => {
        const m = ev.data;
        if (m?.type === "saved" && m.id === id && m.from !== TAB_ID && m.layout) adopt(m.layout);
      };
    } catch {
      ch = null; // no BroadcastChannel: the server-side conflict check still protects saves
    }
    channel.current = ch;
    return () => {
      cancelled = true;
      ch?.close();
      channel.current = null;
      window.clearTimeout(timer.current);
    };
  }, [id, adopt]);

  const update = useCallback(
    (fn: (l: Layout) => Layout) => {
      setLayout((l) => {
        if (!l) return l;
        const next = fn(l);
        if (next !== l) {
          dirty.current = true;
          current.current = next;
          schedule();
        }
        return next;
      });
    },
    [schedule],
  );

  return { layout, update, saveState };
}

/** Layout id from `?layout=<id>` (letters, digits, _ and -), default "default". */
export function layoutIdFromUrl(search: string): string {
  const v = new URLSearchParams(search).get("layout");
  return v && /^[a-zA-Z0-9_-]{1,64}$/.test(v) ? v : "default";
}
