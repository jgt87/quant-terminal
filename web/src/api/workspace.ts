// Workspace persistence: `GET/PUT /api/workspace` with the same `baseUpdatedAt` 409 conflict
// pattern as layouts. When the server has no such route (older server), the workspace lives in
// this browser's localStorage with the same conflict semantics, so callers need no special case.

import type { Workspace } from "@qt/core";
import { ApiError } from "./client";

export type WorkspaceStore = "server" | "local";

const LS_KEY = "qt.workspace";
let store: WorkspaceStore = "server";

export function workspaceStore(): WorkspaceStore {
  return store;
}

/** True for "this server has no such route" (as opposed to "no workspace saved yet"). */
function noRoute(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405) && /no route/i.test(e.message);
}

async function call<T>(method: "GET" | "PUT", body?: unknown): Promise<T> {
  const res = await fetch("/api/workspace", {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `HTTP ${res.status}`, data);
  }
  return data as T;
}

function readLocal(): Workspace | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Workspace) : null;
  } catch {
    return null;
  }
}

function writeLocal(ws: Workspace, baseUpdatedAt?: number): Workspace {
  const cur = readLocal();
  if (baseUpdatedAt !== undefined && cur && cur.updatedAt > baseUpdatedAt) {
    throw new ApiError(409, "conflict", "Workspace was changed elsewhere", { workspace: cur });
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ws));
  } catch {
    /* storage full or unavailable: the in-memory workspace keeps working */
  }
  return ws;
}

/** The stored workspace, or null when none was saved yet. */
export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const ws = await call<Workspace>("GET");
    store = "server";
    // The server returns an unsaved default (updatedAt 0) until the first PUT. A workspace this
    // browser kept locally while the server had no workspace route is newer: migrate it once.
    const local = readLocal();
    if (local && local.updatedAt > (ws.updatedAt ?? 0) && !(ws.updatedAt > 0)) {
      try {
        const migrated = await call<Workspace>("PUT", local);
        localStorage.removeItem(LS_KEY);
        return migrated;
      } catch {
        return local;
      }
    }
    return ws;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !noRoute(e)) {
      store = "server";
      return null;
    }
    // No route (older server) or server unreachable: this browser's copy.
    store = "local";
    return readLocal();
  }
}

/**
 * Save. With `baseUpdatedAt` a newer stored workspace is refused with ApiError 409; the stored
 * one is then in `(err.body as { workspace }).workspace`.
 */
export async function saveWorkspace(ws: Workspace, baseUpdatedAt?: number): Promise<Workspace> {
  if (store === "server") {
    try {
      return await call<Workspace>("PUT", baseUpdatedAt === undefined ? ws : { ...ws, baseUpdatedAt });
    } catch (e) {
      if (!noRoute(e)) throw e;
      store = "local";
    }
  }
  return writeLocal(ws, baseUpdatedAt);
}

/** The newer stored workspace carried by a 409 conflict, if any. */
export function conflictWorkspace(e: unknown): Workspace | undefined {
  if (!(e instanceof ApiError) || e.status !== 409) return undefined;
  const b = e.body as { workspace?: Workspace; current?: Workspace } | null;
  return b?.workspace ?? b?.current;
}
