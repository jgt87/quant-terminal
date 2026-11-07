import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/** Repo root, resolved from this file (server/src/paths.ts), never from cwd. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const DATA_DIR = process.env.QT_DATA_DIR ? path.resolve(process.env.QT_DATA_DIR) : path.join(REPO_ROOT, "data");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const STORE_DIR = path.join(DATA_DIR, "store");
export const WEB_DIST_DIR = path.join(REPO_ROOT, "web", "dist");
/** Where the running server records its process (pid, port, version) for the launcher. */
export const PID_FILE = path.join(DATA_DIR, "server.pid");

/** Version of this install (root package.json). */
export const APP_VERSION: string = (() => {
  try {
    return String(JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version ?? "");
  } catch {
    return "";
  }
})();
