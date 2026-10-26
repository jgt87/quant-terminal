import type { Router } from "../http";
import { readJsonBody } from "../http";
import { Screener, validateScreenerRequest } from "./screener";

export function registerScreenerRoutes(router: Router, screener: Screener): void {
  router.get("/api/screener/universes", () => screener.universes());
  router.post("/api/screener", async ({ req }) => screener.run(validateScreenerRequest(await readJsonBody(req))));
}
