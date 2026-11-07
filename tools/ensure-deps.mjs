// Installs dependencies exactly as package-lock.json pins them, only when needed. Used by
// tools/launch.mjs (and runnable on its own: node tools/ensure-deps.mjs).
//
// Uses `npm ci`, which never rewrites package-lock.json: a launch must not leave tracked files
// modified, or the updater would stop updating the checkout. The lockfile's hash is stamped in
// node_modules after a successful install, so later launches skip npm entirely until an update
// changes the lockfile. A stamped install that lost files (an interrupted install, a virus scanner,
// a manual delete) is installed again.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Files every working install has; one missing means the install is incomplete. */
export const REQUIRED_FILES = [
  "node_modules/tsx/package.json",
  "node_modules/vite/package.json",
  "node_modules/react/package.json",
  "node_modules/@qt/core/package.json",
];

/** What the dependencies need: "current", "install" (lockfile changed or first run) or "repair" (files missing). */
export function depsState(root) {
  const hash = createHash("sha256").update(fs.readFileSync(path.join(root, "package-lock.json"))).digest("hex");
  let stamp = "";
  try {
    stamp = fs.readFileSync(path.join(root, "node_modules", ".qt-deps-stamp"), "utf8").trim();
  } catch {
    /* first install */
  }
  if (stamp !== hash) return { state: "install", hash };
  const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(root, f)));
  return missing.length ? { state: "repair", hash, missing } : { state: "current", hash };
}

/** Install when needed. Returns true when the dependencies are ready. */
export function ensureDeps(root, log = console.log) {
  const s = depsState(root);
  if (s.state === "current") {
    log("Dependencies are up to date.");
    return true;
  }
  log(s.state === "repair" ? `Dependencies are incomplete (${s.missing.join(", ")} missing); installing them again...` : "Installing dependencies...");
  // One fixed command string: npm is a .cmd shim on Windows, so it needs a shell, and passing an
  // argument array together with shell: true is deprecated (DEP0190).
  const r = spawnSync("npm ci --no-audit --no-fund --loglevel=error", { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) return false;
  fs.writeFileSync(path.join(root, "node_modules", ".qt-deps-stamp"), s.hash + "\n");
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.exit(ensureDeps(root) ? 0 : 1);
}
