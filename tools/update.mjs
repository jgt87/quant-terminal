// Auto-updater run by the launchers before they install and build.
// Usage: node tools/update.mjs        (exit 10 = updated, the launcher restarts itself; 0 = nothing changed)
//
// Git checkout: fetches tags from origin and fast-forwards `main` to the newest release tag (vX.Y.Z).
// It never discards work: it only updates on branch main with no changes to tracked files, and only
// by fast-forward; otherwise it says why and leaves the checkout alone. ZIP download (no .git): checks
// the latest GitHub release and says when a newer version exists.
// It never blocks the launch: offline, no git, or any error -> a short note and exit 0.
// QT_NO_UPDATE=1 turns it off.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const UPDATED = 10;
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** Compare "1.2.3" / "v1.2.3" versions: <0, 0, >0. Non-versions sort lowest. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function git(cwd, args, timeout = 20000) {
  const r = spawnSync("git", args, {
    cwd, encoding: "utf8", timeout, windowsHide: true,
    // Never wait for a credential prompt or an editor.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_EDITOR: "true" },
  });
  return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim() };
}

function readVersion(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version ?? "?"; } catch { return "?"; }
}

/**
 * Update a git checkout at `root` to the newest release tag.
 * Returns { status: "updated" | "current" | "skipped", message, from?, to? }.
 */
export function updateGitCheckout(root, { branch = "main", remote = "origin" } = {}) {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { status: "skipped", message: "git is not available; starting the installed version." };
  if (path.resolve(top.out) !== path.resolve(root)) return { status: "skipped", message: "not a Quant Terminal git checkout." };

  const current = git(root, ["symbolic-ref", "--short", "-q", "HEAD"]).out;
  if (current !== branch) return { status: "skipped", message: `on branch "${current || "(detached)"}", not ${branch}; not updating.` };

  const dirty = git(root, ["status", "--porcelain", "--untracked-files=no"]);
  if (!dirty.ok) return { status: "skipped", message: `git status failed: ${dirty.err}` };
  if (dirty.out) return { status: "skipped", message: "local changes to tracked files; not updating (commit or discard them to get updates)." };

  const fetch = git(root, ["fetch", "--quiet", "--tags", "--force", remote]);
  if (!fetch.ok) return { status: "skipped", message: "could not reach the update server (offline?); starting the installed version." };

  const tags = git(root, ["tag", "-l", "v*"]).out.split(/\r?\n/).filter((t) => TAG.test(t));
  if (!tags.length) return { status: "current", message: "no releases published yet." };
  const latest = tags.sort(compareVersions).at(-1);

  const head = git(root, ["rev-parse", "HEAD"]).out;
  const target = git(root, ["rev-parse", `${latest}^{commit}`]).out;
  if (head === target) return { status: "current", message: `up to date (${latest}).` };
  if (git(root, ["merge-base", "--is-ancestor", target, head]).ok) {
    return { status: "current", message: `up to date (ahead of the latest release ${latest}).` };
  }
  if (!git(root, ["merge-base", "--is-ancestor", head, target]).ok) {
    return { status: "skipped", message: `${branch} has local commits that are not in ${latest}; not updating.` };
  }

  const from = readVersion(root);
  const merge = git(root, ["merge", "--ff-only", "--quiet", target], 60000);
  if (!merge.ok) return { status: "skipped", message: `update to ${latest} failed: ${merge.err.split("\n")[0]}` };
  return { status: "updated", from, to: readVersion(root), message: `updated ${from} -> ${latest}.` };
}

/** ZIP download: tell the user when GitHub has a newer release. Never throws. */
export async function checkLatestRelease(root, { timeoutMs = 5000 } = {}) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? pkg.repository ?? "")?.[1];
    if (!repo) return { status: "skipped", message: "no repository configured." };
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "quant-terminal-updater" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { status: "skipped", message: `release check failed (HTTP ${res.status}).` };
    const rel = await res.json();
    if (TAG.test(rel.tag_name) && compareVersions(rel.tag_name, pkg.version) > 0) {
      return { status: "available", message: `version ${rel.tag_name} is available (you have v${pkg.version}): ${rel.html_url}` };
    }
    return { status: "current", message: `up to date (v${pkg.version}).` };
  } catch {
    return { status: "skipped", message: "could not check for updates (offline?)." };
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (process.env.QT_NO_UPDATE === "1") return 0;
  const result = fs.existsSync(path.join(root, ".git")) ? updateGitCheckout(root) : await checkLatestRelease(root);
  console.log(`[update] ${result.message}`);
  if (result.status === "available") console.log("[update] download it from that page, or install with git clone to get updates automatically.");
  return result.status === "updated" ? UPDATED : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code), (err) => {
    console.log(`[update] skipped: ${err?.message ?? err}`);
    process.exit(0);
  });
}
