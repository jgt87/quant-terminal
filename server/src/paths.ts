import { fileURLToPath } from "node:url";
import path from "node:path";

/** Repo root, resolved from this file (server/src/paths.ts), never from cwd. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const DATA_DIR = process.env.QT_DATA_DIR ? path.resolve(process.env.QT_DATA_DIR) : path.join(REPO_ROOT, "data");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const STORE_DIR = path.join(DATA_DIR, "store");
export const WEB_DIST_DIR = path.join(REPO_ROOT, "web", "dist");
