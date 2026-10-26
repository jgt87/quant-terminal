// Drawing-tool conformance harness: catalog coverage, settings wiring and interaction smoke per tool.
// Usage: npm run test:drawings [-- --family <family>] [-- --tool <type>]
// Writes docs/verification/drawings-coverage.md (or drawings-coverage-<family>.md with --family).
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = { ...process.env, QT_DRAWINGS_SCOPE: "all" };
if (opt("family")) env.QT_DRAWINGS_FAMILY = opt("family");
if (opt("tool")) env.QT_DRAWINGS_TOOL = opt("tool");
const r = spawnSync("npx", ["vitest", "run", "web/test/drawings-conformance.test.ts"], { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
