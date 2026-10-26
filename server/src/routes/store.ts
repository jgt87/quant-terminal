import type { Router } from "../http";
import { readJsonBody, sendJson } from "../http";
import type { Store } from "../store";
import { assertId } from "../store";
import { notFound } from "../errors";
import { layoutBase, validateLayout, validateWatchlists } from "../validate";
import { registerDrawingTemplateRoutes } from "../drawings/templates";

export function registerStoreRoutes(router: Router, store: Store): void {
  registerDrawingTemplateRoutes(router, store);

  router.get("/api/watchlists", () => store.getWatchlists());

  router.put("/api/watchlists", async ({ req }) => {
    const lists = validateWatchlists(await readJsonBody(req));
    await store.putWatchlists(lists);
    return lists;
  });

  router.get("/api/layouts", () => store.listLayouts());

  router.get("/api/layouts/:id", async ({ params }) => {
    const layout = await store.getLayout(assertId(params.id));
    if (!layout) throw notFound(`Layout not found: ${params.id}`);
    return layout;
  });

  // Optional `baseUpdatedAt` in the body: the updatedAt the client last saw. When the stored
  // layout is newer (another tab or device saved in between), answer 409 with the stored layout.
  router.put("/api/layouts/:id", async ({ req, res, params }) => {
    const id = assertId(params.id);
    const body = await readJsonBody(req);
    const base = layoutBase(body);
    const layout = validateLayout(id, body);
    const r = await store.saveLayout(layout, base);
    if (r.ok) return r.layout;
    sendJson(res, 409, { error: { code: "conflict", message: "Layout was changed elsewhere" }, layout: r.current });
    return undefined;
  });

  router.delete("/api/layouts/:id", async ({ params }) => {
    const existed = await store.deleteLayout(assertId(params.id));
    if (!existed) throw notFound(`Layout not found: ${params.id}`);
    return { ok: true };
  });
}
