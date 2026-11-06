// Installs dependencies exactly as package-lock.json pins them, only when needed. Run by the launchers.
// Usage: node tools/ensure-deps.mjs
//
// Uses `npm ci`, which never rewrites package-lock.json: a launch must not leave tracked files
// modified, or tools/update.mjs would stop updating the checkout. The lockfile's hash is stamped in
// node_modules after a successful install, so later launches skip npm entirely until an update
// changes the lockfile.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockFile = path.join(root, "package-lock.json");
const stampFile = path.join(root, "node_modules", ".qt-deps-stamp");

const hash = createHash("sha256").update(fs.readFileSync(lockFile)).digest("hex");
let stamp = "";
try { stamp = fs.readFileSync(stampFile, "utf8").trim(); } catch { /* first install */ }

if (stamp === hash) {
  console.log("Dependencies are up to date.");
  process.exit(0);
}

console.log("Installing dependencies...");
// One fixed command string: npm is a .cmd shim on Windows, so it needs a shell, and passing an
// argument array together with shell: true is deprecated (DEP0190).
const r = spawnSync("npm ci --no-audit --no-fund --loglevel=error", { cwd: root, stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status || 1);
fs.writeFileSync(stampFile, hash + "\n");
