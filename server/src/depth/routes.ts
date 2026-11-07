// Order book routes (Binance symbols):
//   GET /api/depth?symbol=&levels=&step=          current book, best first per side
//   GET /api/depth/history?symbol=&from=&to=&max= heatmap frames (UTC ms)
//   GET /api/depth/stream?symbol=&levels=&step=   SSE: `book` frames at most every 250 ms
//   GET /api/depth/recorded?symbol=&from=&to=&max= recorded frames only (depth replay)
//   GET /api/depth/recording                       recorded pairs
//   PUT /api/depth/recording {symbol, on}          turn disk recording of a pair on / off
//   GET /api/depth/status                          running feeds

import { readJsonBody, type Router } from "../http";
import { badRequest } from "../errors";
import { serveSse } from "../util/sse";
import { intParam } from "../routes/market";
import type { DepthService } from "./service";

const STREAM_MS = 250;

function symbolOf(url: URL): string {
  const s = (url.searchParams.get("symbol") ?? "").trim();
  if (!s) throw badRequest("symbol is required");
  return s;
}

function stepOf(url: URL): number {
  const raw = url.searchParams.get("step");
  if (raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw badRequest("step must be a non-negative number");
  return n;
}

function levelsOf(url: URL): number {
  const n = intParam(url, "levels") ?? 100;
  if (n < 1 || n > 500) throw badRequest("levels must be between 1 and 500");
  return n;
}

export function registerDepthRoutes(router: Router, depth: DepthService): void {
  router.get("/api/depth", async ({ url }) => depth.snapshot(symbolOf(url), levelsOf(url), stepOf(url)));

  router.get("/api/depth/status", async () => ({ feeds: depth.status() }));

  router.get("/api/depth/history", async ({ url }) => {
    const symbol = symbolOf(url);
    const from = intParam(url, "from") ?? 0;
    const to = intParam(url, "to") ?? Number.MAX_SAFE_INTEGER;
    if (to < from) throw badRequest("to must not be before from");
    const max = intParam(url, "max") ?? 2000;
    if (max < 1) throw badRequest("max must be positive");
    return depth.history(symbol, from, to, max);
  });

  router.get("/api/depth/recorded", async ({ url }) => {
    const symbol = symbolOf(url);
    const from = intParam(url, "from");
    const to = intParam(url, "to");
    if (from === undefined || to === undefined || to < from) throw badRequest("from and to (UTC ms, from <= to) are required");
    return depth.recorded(symbol, from, to, intParam(url, "max") ?? 2000);
  });

  router.get("/api/depth/recording", async () => ({ recordings: await depth.recordings() }));

  router.put("/api/depth/recording", async ({ req }) => {
    const body = (await readJsonBody(req)) as { symbol?: unknown; on?: unknown } | null;
    if (!body || typeof body.symbol !== "string" || !body.symbol.trim() || typeof body.on !== "boolean") throw badRequest("Body must be {symbol: string, on: boolean}");
    return { recordings: await depth.setRecording(body.symbol.trim(), body.on) };
  });

  router.get("/api/depth/stream", async ({ req, res, url }) => {
    const symbol = symbolOf(url);
    const levels = levelsOf(url);
    const step = stepOf(url);
    let dirty = true;
    const sub = await depth.subscribe(symbol, () => (dirty = true));
    await serveSse(req, res, (send) => {
      const tick = () => {
        // Also send while unsynced so the client sees the mode (stream / poll) change.
        if (!dirty && sub.feed.synced) return;
        dirty = false;
        send("book", depth.view(sub.feed, levels, step));
      };
      tick();
      const t = setInterval(tick, STREAM_MS);
      return () => {
        clearInterval(t);
        sub.unsubscribe();
      };
    });
  });
}
