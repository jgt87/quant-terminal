import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, badRequest } from "./errors";

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
}

/** A handler returns the JSON body to send (status 200), or undefined if it already responded. */
export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

type Method = "GET" | "PUT" | "POST" | "DELETE";

interface Route {
  method: Method;
  parts: string[];
  handler: Handler;
}

const MAX_BODY = 5 * 1024 * 1024;

/** Minimal path router: exact segments and `:name` params. */
export class Router {
  private routes: Route[] = [];

  add(method: Method, pattern: string, handler: Handler): this {
    this.routes.push({ method, parts: pattern.split("/").filter(Boolean), handler });
    return this;
  }
  get(p: string, h: Handler) { return this.add("GET", p, h); }
  put(p: string, h: Handler) { return this.add("PUT", p, h); }
  post(p: string, h: Handler) { return this.add("POST", p, h); }
  delete(p: string, h: Handler) { return this.add("DELETE", p, h); }

  /** Returns the match, "method" when the path exists with another method, or undefined. */
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | "method" | undefined {
    let segs: string[];
    try {
      segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return undefined;
    }
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = segs[i];
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method) return { handler: r.handler, params };
    }
    return pathMatched ? "method" : undefined;
  }
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  console.error("[server] internal error:", err);
  sendJson(res, 500, { error: { code: "internal", message: "Internal server error" } });
}

/** Read and parse a JSON request body (max 5 MB). */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) throw new HttpError(413, "bad_request", "Request body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw badRequest("Missing JSON body");
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Body is not valid JSON");
  }
}
