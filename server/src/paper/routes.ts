import type { Router } from "../http";
import { readJsonBody } from "../http";
import { assertId } from "../store";
import { badRequest } from "../errors";
import type { PaperEngine } from "./engine";

export function registerPaperRoutes(router: Router, paper: PaperEngine): void {
  router.get("/api/paper", () => paper.list());
  router.post("/api/paper", async ({ req }) => paper.create(await readJsonBody(req).catch(() => ({}))));
  router.get("/api/paper/:id", ({ params }) => paper.get(assertId(params.id)));
  router.delete("/api/paper/:id", async ({ params }) => {
    await paper.remove(assertId(params.id));
    return { ok: true };
  });
  router.post("/api/paper/:id/reset", ({ params }) => paper.reset(assertId(params.id)));
  router.post("/api/paper/:id/orders", async ({ req, params }) => paper.placeOrder(assertId(params.id), await readJsonBody(req)));
  router.put("/api/paper/:id/orders/:orderId", async ({ req, params }) => paper.modifyOrder(assertId(params.id), assertId(params.orderId), await readJsonBody(req)));
  router.delete("/api/paper/:id/orders/:orderId", ({ params }) => paper.cancelOrder(assertId(params.id), assertId(params.orderId)));
  router.post("/api/paper/:id/close/:symbol", ({ params }) => {
    const symbol = params.symbol.trim();
    if (!symbol || symbol.length > 64) throw badRequest("symbol is invalid");
    return paper.closePosition(assertId(params.id), symbol);
  });
}
