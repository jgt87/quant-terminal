import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serve the built web app from `root` with SPA fallback to index.html.
 * Returns false when nothing can be served (the caller sends a 404).
 */
export async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const base = path.resolve(root);
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel.includes("\0")) return false;
  let file = path.resolve(base, "." + path.posix.normalize("/" + rel.replace(/\\/g, "/")));
  if (file !== base && !file.startsWith(base + path.sep)) return false;
  if (!(await isFile(file))) {
    if (path.extname(rel)) return false; // missing asset: real 404
    file = path.join(base, "index.html");
    if (!(await isFile(file))) return false;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  await new Promise<void>((resolve, reject) => {
    createReadStream(file).on("error", reject).on("end", resolve).pipe(res);
  });
  return true;
}
