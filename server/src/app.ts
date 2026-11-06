import { existsSync } from "node:fs";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { applyCors, Router, sendError, sendJson } from "./http";
import { HttpError, notFound } from "./errors";
import { MarketData } from "./providers";
import { Store } from "./store";
import { registerMarketRoutes } from "./routes/market";
import { registerStoreRoutes } from "./routes/store";
import { registerBacktestRoute } from "./routes/backtest";
import { registerStreamRoute } from "./routes/stream";
import { OrderFlowService, registerOrderFlowRoutes } from "./routes/orderflow";
import { serveStatic } from "./routes/static";
import { AlertEngine } from "./alerts/engine";
import { registerAlertRoutes } from "./alerts/routes";
import { Screener } from "./screener/screener";
import { registerScreenerRoutes } from "./screener/routes";
import { registerPortfolioRoutes } from "./portfolio/routes";
import { PaperEngine } from "./paper/engine";
import { registerPaperRoutes } from "./paper/routes";
import { registerWorkspaceRoutes } from "./workspace/routes";

export interface AppDeps {
  market: MarketData;
  store: Store;
  /** Built web app directory; served for non-/api paths when it exists. */
  webDist?: string;
  /** Optional pre-built engines (tests inject their own); created on demand otherwise. */
  alerts?: AlertEngine;
  paper?: PaperEngine;
  screener?: Screener;
  /** Start the alert (5 s) and paper-trading (2 s fills, 1 min equity) loops. */
  background?: boolean;
}

export function createRouter(deps: AppDeps): Router {
  const router = new Router();
  registerMarketRoutes(router, deps.market);
  registerStoreRoutes(router, deps.store);
  registerBacktestRoute(router, deps.market);
  registerStreamRoute(router, deps.market);
  registerOrderFlowRoutes(router, new OrderFlowService(deps.market));

  const alerts = deps.alerts ?? new AlertEngine({ store: deps.store, market: deps.market });
  const paper = deps.paper ?? new PaperEngine({ store: deps.store, market: deps.market });
  registerAlertRoutes(router, alerts);
  registerScreenerRoutes(router, deps.screener ?? new Screener(deps.market, deps.store));
  registerPortfolioRoutes(router, deps.store, deps.market);
  registerPaperRoutes(router, paper);
  registerWorkspaceRoutes(router, deps.store);
  if (deps.background) {
    alerts.start();
    paper.start();
  }
  return router;
}

/** Build the node:http request listener. */
export function createApp(deps: AppDeps): RequestListener {
  const router = createRouter(deps);
  const serveWeb = deps.webDist && existsSync(deps.webDist) ? deps.webDist : undefined;

  return (req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res).catch((err) => {
      if (!res.headersSent) sendError(res, err);
      else res.destroy();
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (!isApi) {
      if (serveWeb && (await serveStatic(serveWeb, req, res, url.pathname))) return;
      throw notFound("Not found");
    }
    const m = router.match(req.method ?? "GET", url.pathname);
    if (m === undefined) throw notFound(`No route for ${url.pathname}`);
    if (m === "method") throw new HttpError(405, "bad_request", `Method ${req.method} not allowed`);
    const body = await m.handler({ req, res, url, params: m.params });
    if (!res.headersSent) sendJson(res, 200, body ?? null);
  }
}
