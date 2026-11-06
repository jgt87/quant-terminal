import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareVersions, updateGitCheckout } from "../../tools/update.mjs";

// Real git repositories in a temp dir: a bare "origin", a "dev" clone that publishes releases,
// and a "user" clone that the updater runs on.
let dir: string;
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const at = (name: string) => path.join(dir, name);
const write = (repo: string, file: string, text: string) => writeFileSync(path.join(at(repo), file), text);
const version = (repo: string) => JSON.parse(readFileSync(path.join(at(repo), "package.json"), "utf8")).version;

function release(v: string, { tag = true } = {}) {
  write("dev", "package.json", JSON.stringify({ name: "qt", version: v }) + "\n");
  git(at("dev"), "commit", "-qam", `v${v}`);
  if (tag) git(at("dev"), "tag", "-a", `v${v}`, "-m", `v${v}`);
  git(at("dev"), "push", "-q", "--follow-tags", "origin", "main");
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qt-updater-"));
  git(dir, "init", "-q", "--bare", "-b", "main", "origin.git");
  git(dir, "clone", "-q", at("origin.git"), "dev");
  for (const repo of ["dev"]) {
    git(at(repo), "config", "user.email", "t@example.invalid");
    git(at(repo), "config", "user.name", "t");
    git(at(repo), "checkout", "-q", "-b", "main");
  }
  write("dev", "package.json", JSON.stringify({ name: "qt", version: "0.1.0" }) + "\n");
  git(at("dev"), "add", ".");
  git(at("dev"), "commit", "-qm", "init");
  git(at("dev"), "tag", "-a", "v0.1.0", "-m", "v0.1.0");
  git(at("dev"), "push", "-q", "--follow-tags", "origin", "main");
  git(dir, "clone", "-q", at("origin.git"), "user");
  git(at("user"), "config", "user.email", "u@example.invalid");
  git(at("user"), "config", "user.name", "u");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Each case runs several real git commands; allow for slow disks and antivirus scanning on Windows.
describe("tools/update.mjs", { timeout: 30000 }, () => {
  it("compares versions numerically", () => {
    expect(compareVersions("v0.10.0", "v0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "v0.2.0")).toBe(0);
    expect(compareVersions("v1.0.0", "v1.0.1")).toBeLessThan(0);
  });

  it("reports up to date when on the latest release", () => {
    expect(updateGitCheckout(at("user")).status).toBe("current");
  });

  it("fast-forwards to the newest release tag, not to untagged commits after it", () => {
    release("0.2.0");
    release("0.10.0");
    release("0.11.0-wip", { tag: false });
    const r = updateGitCheckout(at("user"));
    expect(r.status).toBe("updated");
    expect(r.message).toContain("v0.10.0");
    expect(version("user")).toBe("0.10.0");
    expect(updateGitCheckout(at("user")).status).toBe("current");
  });

  it("does not touch local changes to tracked files", () => {
    release("0.2.0");
    write("user", "package.json", '{"name":"qt","version":"local"}\n');
    const r = updateGitCheckout(at("user"));
    expect(r.status).toBe("skipped");
    expect(r.message).toMatch(/local changes/);
    expect(version("user")).toBe("local");
  });

  it("does not update another branch or a checkout with its own commits", () => {
    release("0.2.0");
    git(at("user"), "checkout", "-q", "-b", "feature");
    expect(updateGitCheckout(at("user")).status).toBe("skipped");
    git(at("user"), "checkout", "-q", "main");
    write("user", "local.txt", "mine\n");
    git(at("user"), "add", "local.txt");
    git(at("user"), "commit", "-qm", "local work");
    const r = updateGitCheckout(at("user"));
    expect(r.status).toBe("skipped");
    expect(r.message).toMatch(/local commits/);
    expect(version("user")).toBe("0.1.0");
  });

  it("starts the installed version when the remote is unreachable", () => {
    release("0.2.0");
    git(at("user"), "remote", "set-url", "origin", at("missing.git"));
    const r = updateGitCheckout(at("user"));
    expect(r.status).toBe("skipped");
    expect(version("user")).toBe("0.1.0");
  });
});
