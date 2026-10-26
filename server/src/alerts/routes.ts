import type { Router } from "../http";
import { readJsonBody } from "../http";
import { assertId } from "../store";
import { badRequest } from "../errors";
import { serveSse } from "../util/sse";
import type { AlertEngine, FiredPayload } from "./engine";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function registerAlertRoutes(router: Router, engine: AlertEngine): void {
  router.get("/api/alerts", () => engine.list());
  router.post("/api/alerts", async ({ req }) => engine.create(await readJsonBody(req)));

  // Static paths before /api/alerts/:id.
  router.get("/api/alerts/status", () => engine.status());

  router.get("/api/alerts/events", async ({ url }) => {
    const raw = url.searchParams.get("since");
    let since: number | undefined;
    if (raw !== null && raw !== "") {
      since = Number(raw);
      if (!Number.isFinite(since)) throw badRequest("since must be a timestamp in ms");
    }
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw badRequest("limit must be a positive integer");
    return engine.events(since, limit);
  });

  router.put("/api/alerts/events/seen", async ({ req }) => {
    const body = await readJsonBody(req);
    if (!isObj(body)) throw badRequest("Body must be an object: {ids} | {before} | {all: true}");
    const sel: { ids?: string[]; before?: number; all?: boolean } = {};
    if (body.ids !== undefined) {
      if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== "string")) throw badRequest("ids must be an array of strings");
      sel.ids = body.ids as string[];
    }
    if (body.before !== undefined) {
      if (typeof body.before !== "number" || !Number.isFinite(body.before)) throw badRequest("before must be a timestamp in ms");
      sel.before = body.before;
    }
    if (body.all !== undefined) sel.all = body.all === true;
    if (!sel.ids && sel.before === undefined && !sel.all) throw badRequest("Give ids, before or all: true");
    return { updated: await engine.markSeen(sel) };
  });

  router.get("/api/alerts/stream", async ({ req, res }) => {
    await serveSse(req, res, (send) => {
      const onFired = (p: FiredPayload) => send("alert", p);
      engine.on("fired", onFired);
      return () => engine.off("fired", onFired);
    });
    return undefined;
  });

  router.get("/api/alerts/:id", ({ params }) => engine.get(assertId(params.id)));
  router.put("/api/alerts/:id", async ({ req, params }) => engine.update(assertId(params.id), await readJsonBody(req)));
  router.delete("/api/alerts/:id", async ({ params }) => {
    await engine.remove(assertId(params.id));
    return { ok: true };
  });
}
