import type { GridKind, Interval, LinkColor, LinkGroup, UserScript, Workspace, WorkspaceTab } from "@qt/core";
import type { Router } from "../http";
import { readJsonBody, sendJson } from "../http";
import type { Store } from "../store";
import { assertId, ID_RE, newId } from "../store";
import { badRequest, notFound } from "../errors";

export const WORKSPACE_FILE = "workspace.json";
export const SCRIPTS_COLLECTION = "scripts";
export const MAX_SCRIPT_BYTES = 200 * 1024;

export const LINK_COLORS: readonly LinkColor[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink", "grey"];
const GRIDS: readonly GridKind[] = ["1", "2h", "2v", "3", "4", "6", "8", "9", "12", "16"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

export function defaultWorkspace(): Workspace {
  return {
    id: "default",
    tabs: [{ id: "main", name: "Main", grid: "1", cells: [{ layoutId: "default" }] }],
    activeTab: "main",
    linkGroups: LINK_COLORS.map((color) => ({ color, symbol: true, interval: false, time: false })),
    crosshairSync: false,
    updatedAt: 0,
  };
}

export function validateWorkspace(body: unknown, now: number): Workspace {
  if (!isObj(body)) throw badRequest("Workspace must be an object");
  const id = body.id === undefined ? "default" : body.id;
  if (typeof id !== "string" || !ID_RE.test(id)) throw badRequest("id is invalid");
  if (!Array.isArray(body.tabs) || body.tabs.length < 1 || body.tabs.length > 50) throw badRequest("tabs must be an array of 1 to 50 tabs");
  const tabIds = new Set<string>();
  const tabs: WorkspaceTab[] = body.tabs.map((t, i) => {
    if (!isObj(t)) throw badRequest(`tabs[${i}] must be an object`);
    if (typeof t.id !== "string" || !ID_RE.test(t.id)) throw badRequest(`tabs[${i}].id is invalid`);
    if (tabIds.has(t.id)) throw badRequest(`Duplicate tab id: ${t.id}`);
    tabIds.add(t.id);
    if (!str(t.name, 100)) throw badRequest(`tabs[${i}].name must be a string (max 100)`);
    if (!GRIDS.includes(t.grid as GridKind)) throw badRequest(`tabs[${i}].grid must be one of: ${GRIDS.join(", ")}`);
    if (!Array.isArray(t.cells) || t.cells.length < 1 || t.cells.length > 16) throw badRequest(`tabs[${i}].cells must have 1 to 16 cells`);
    const cells = t.cells.map((c, j) => {
      if (!isObj(c) || typeof c.layoutId !== "string" || !ID_RE.test(c.layoutId)) throw badRequest(`tabs[${i}].cells[${j}].layoutId is invalid`);
      if (c.link !== undefined && c.link !== null && !LINK_COLORS.includes(c.link as LinkColor)) throw badRequest(`tabs[${i}].cells[${j}].link is invalid`);
      return c.link ? { layoutId: c.layoutId, link: c.link as LinkColor } : { layoutId: c.layoutId };
    });
    const tab: WorkspaceTab = { id: t.id, name: t.name, grid: t.grid as GridKind, cells };
    if (t.sizes !== undefined) {
      if (!Array.isArray(t.sizes) || t.sizes.length > 32 || t.sizes.some((s) => typeof s !== "number" || !Number.isFinite(s) || s <= 0)) {
        throw badRequest(`tabs[${i}].sizes must be positive numbers`);
      }
      tab.sizes = t.sizes as number[];
    }
    return tab;
  });
  if (typeof body.activeTab !== "string" || !tabIds.has(body.activeTab)) throw badRequest("activeTab must be the id of one of the tabs");
  const groupsRaw = body.linkGroups === undefined ? defaultWorkspace().linkGroups : body.linkGroups;
  if (!Array.isArray(groupsRaw) || groupsRaw.length > LINK_COLORS.length) throw badRequest("linkGroups must be an array");
  const seen = new Set<string>();
  const linkGroups: LinkGroup[] = groupsRaw.map((g, i) => {
    if (!isObj(g) || !LINK_COLORS.includes(g.color as LinkColor)) throw badRequest(`linkGroups[${i}].color is invalid`);
    if (seen.has(g.color as string)) throw badRequest(`Duplicate link group: ${g.color}`);
    seen.add(g.color as string);
    for (const k of ["symbol", "interval", "time"]) if (typeof g[k] !== "boolean") throw badRequest(`linkGroups[${i}].${k} must be a boolean`);
    return { color: g.color as LinkColor, symbol: g.symbol as boolean, interval: g.interval as boolean, time: g.time as boolean };
  });
  const crosshairSync = body.crosshairSync === undefined ? false : body.crosshairSync;
  if (typeof crosshairSync !== "boolean") throw badRequest("crosshairSync must be a boolean");
  const linkValues = sanitizeLinkValues(body.linkValues);
  return { id, tabs, activeTab: body.activeTab, linkGroups, crosshairSync, updatedAt: now, ...(linkValues ? { linkValues } : {}) };
}

const INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"]);

/** Optional per-color linked values (malformed entries are dropped, never rejected). */
export function sanitizeLinkValues(raw: unknown): Workspace["linkValues"] {
  if (!isObj(raw)) return undefined;
  const out: NonNullable<Workspace["linkValues"]> = {};
  for (const color of LINK_COLORS) {
    const v = raw[color];
    if (!isObj(v)) continue;
    const e: NonNullable<Workspace["linkValues"]>[LinkColor] = {};
    if (str(v.symbol, 200) && v.symbol && typeof v.symbolAt === "number" && Number.isFinite(v.symbolAt)) {
      e.symbol = v.symbol;
      e.symbolAt = v.symbolAt;
    }
    if (typeof v.interval === "string" && INTERVALS.has(v.interval) && typeof v.intervalAt === "number" && Number.isFinite(v.intervalAt)) {
      e.interval = v.interval as Interval;
      e.intervalAt = v.intervalAt;
      if (str(v.customInterval, 16) && v.customInterval) e.customInterval = v.customInterval;
    }
    if (e.symbolAt !== undefined || e.intervalAt !== undefined) out[color] = e;
  }
  return Object.keys(out).length ? out : undefined;
}

export function validateScript(body: unknown, id: string, now: number): UserScript {
  if (!isObj(body)) throw badRequest("Script must be an object");
  if (body.id !== undefined && body.id !== id) throw badRequest("Script id does not match the URL");
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200) throw badRequest("name is required (max 200)");
  if (body.kind !== "indicator" && body.kind !== "strategy") throw badRequest("kind must be indicator or strategy");
  if (typeof body.source !== "string") throw badRequest("source must be a string");
  if (Buffer.byteLength(body.source, "utf8") > MAX_SCRIPT_BYTES) throw badRequest(`source is larger than ${MAX_SCRIPT_BYTES / 1024} KB`);
  return { id, name: body.name.trim(), kind: body.kind, source: body.source, updatedAt: now };
}

export function registerWorkspaceRoutes(router: Router, store: Store): void {
  router.get("/api/workspace", async () => (await store.readDoc<Workspace>(WORKSPACE_FILE)) ?? defaultWorkspace());

  // Optional `baseUpdatedAt`: when the stored workspace is newer, answer 409 with it (as layouts do).
  router.put("/api/workspace", async ({ req, res }) => {
    const body = await readJsonBody(req);
    let base: number | undefined;
    if (isObj(body) && body.baseUpdatedAt !== undefined && body.baseUpdatedAt !== null) {
      if (typeof body.baseUpdatedAt !== "number" || !Number.isFinite(body.baseUpdatedAt)) throw badRequest("baseUpdatedAt must be a number");
      base = body.baseUpdatedAt;
    }
    const ws = validateWorkspace(body, Date.now());
    const r = await store.updateDoc<Workspace, { ok: true; ws: Workspace } | { ok: false; current: Workspace }>(WORKSPACE_FILE, (cur) => {
      if (cur && base !== undefined && (cur.updatedAt ?? 0) > base) return { result: { ok: false, current: cur } };
      const stamped = { ...ws, updatedAt: Math.max(ws.updatedAt, (cur?.updatedAt ?? 0) + 1) };
      return { value: stamped, result: { ok: true, ws: stamped } };
    });
    if (r.ok) return r.ws;
    sendJson(res, 409, { error: { code: "conflict", message: "Workspace was changed elsewhere" }, workspace: r.current });
    return undefined;
  });

  // Scripts: one file per script under store/scripts/. The list omits the source.
  router.get("/api/scripts", async () => {
    const all = await store.listItems<UserScript>(SCRIPTS_COLLECTION);
    return all
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind, updatedAt: s.updatedAt, size: Buffer.byteLength(s.source ?? "", "utf8") }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  router.post("/api/scripts", async ({ req }) => {
    const body = await readJsonBody(req);
    const s = validateScript(isObj(body) ? { ...body, id: undefined } : body, newId(), Date.now());
    await store.putItem(SCRIPTS_COLLECTION, s.id, s);
    return s;
  });

  router.get("/api/scripts/:id", async ({ params }) => {
    const s = await store.getItem<UserScript>(SCRIPTS_COLLECTION, assertId(params.id));
    if (!s) throw notFound(`Script not found: ${params.id}`);
    return s;
  });

  router.put("/api/scripts/:id", async ({ req, params }) => {
    const id = assertId(params.id);
    const s = validateScript(await readJsonBody(req), id, Date.now());
    await store.putItem(SCRIPTS_COLLECTION, id, s);
    return s;
  });

  router.delete("/api/scripts/:id", async ({ params }) => {
    if (!(await store.deleteItem(SCRIPTS_COLLECTION, assertId(params.id)))) throw notFound(`Script not found: ${params.id}`);
    return { ok: true };
  });
}
