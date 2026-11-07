import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computerChecks, formatChecks, main, nodeSupported, parseArgs, portBusy, probeTerminal, readPidFile, replacedBy, whatsNew, writeReplacedNote } from "../../tools/launch.mjs";
import { parseChangelog, renderWhatsNew, sectionsBetween, summarize } from "../../tools/changelog.mjs";
import { depsState, REQUIRED_FILES } from "../../tools/ensure-deps.mjs";

const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "qt-launch-"));
  temps.push(d);
  return d;
};
afterEach(() => temps.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("launcher arguments and Node.js versions", () => {
  it("parses the mode and flags, keeping unknown options", () => {
    expect(parseArgs([])).toEqual({ fx: "yahoo", check: false, noUpdate: false, noBrowser: false, unknown: [] });
    expect(parseArgs(["--fx", "MT5", "--check", "--no-update", "--no-browser"])).toMatchObject({ fx: "mt5", check: true, noUpdate: true, noBrowser: true });
    expect(parseArgs(["--fx", "deriv", "--fx", "bogus", "-x"])).toMatchObject({ fx: "deriv", unknown: ["--fx bogus", "-x"] });
  });

  it.each([
    ["20.18.3", "yahoo", false],
    ["20.19.0", "yahoo", true],
    ["21.7.0", "yahoo", false],
    ["22.11.0", "yahoo", false],
    ["22.12.0", "yahoo", true],
    ["26.12.1", "yahoo", true],
    ["20.19.0", "deriv", false],
    ["22.12.0", "deriv", true],
    ["v24.1.0", "deriv", true],
  ] as const)("Node %s for %s: %s", (v, fx, ok) => {
    expect(nodeSupported(v, fx)).toBe(ok);
  });

  it("fails the computer check on an unsupported Node.js and names the versions to install", async () => {
    const checks = await computerChecks("yahoo", { nodeVersion: "18.20.0", isGit: true });
    expect(checks[0]).toMatchObject({ status: "FAIL", name: "Node.js" });
    expect(checks[0].detail).toContain("20.19+ or 22.12+");
    expect(formatChecks(checks)).toMatch(/^ {2}FAIL Node\.js: 18\.20\.0 is not supported/);
  });

  it("explains ZIP installs instead of checking Git", async () => {
    const checks = await computerChecks("yahoo", { nodeVersion: "22.12.0", isGit: false });
    expect(checks.find((c) => c.name === "Updates")).toMatchObject({ status: "INFO" });
    expect(checks.some((c) => c.name === "Git")).toBe(false);
  });
});

describe("launcher: what runs on the port", () => {
  const servers: (HttpServer | ReturnType<typeof createNetServer>)[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))));
  });
  const listen = async (s: HttpServer | ReturnType<typeof createNetServer>) => {
    servers.push(s);
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
    return (s.address() as AddressInfo).port;
  };
  const health = (body: unknown) =>
    listen(
      createHttpServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(req.url === "/api/health" ? body : { error: "no" }));
      }),
    );

  it("sees a busy and a free port", async () => {
    const port = await listen(createNetServer());
    expect(await portBusy(port)).toBe(true);
    servers.pop()!.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(await portBusy(port)).toBe(false);
  });

  it("recognises Quant Terminal with its version, an older one, and another program", async () => {
    expect(await probeTerminal(await health({ ok: true, app: "quant-terminal", version: "0.5.2" }))).toEqual({ app: "quant-terminal", version: "0.5.2" });
    expect(await probeTerminal(await health({ ok: true }))).toEqual({ app: "quant-terminal", version: "" });
    expect(await probeTerminal(await health({ status: "up" }))).toBeNull();
  });

  it("stops at another program on the port and opens a running instance of the same version", async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (m: string) => lines.push(m);
    try {
      const other = await health({ status: "up" });
      expect(await main(["--check", "--no-update"], { PORT: String(other) })).toBe(1);
      expect(lines.join("\n")).toMatch(new RegExp(`FAIL Port ${other}: used by another program`));
      lines.length = 0;
      const { version } = await import("../../package.json", { with: { type: "json" } }).then((m) => m.default);
      const same = await health({ ok: true, app: "quant-terminal", version });
      const code = await main(["--check", "--no-update"], { PORT: String(same) });
      expect(lines.join("\n")).toMatch(new RegExp(`Quant Terminal v${version.replace(/\./g, "\\.")} is already running`));
      expect(code).toBe(lines.some((l) => /^ {2}FAIL/.test(l)) ? 1 : 0);
    } finally {
      console.log = log;
    }
  });

  it("reads the server's pid file", () => {
    const dir = temp();
    expect(readPidFile(dir)).toBeNull();
    writeFileSync(path.join(dir, "server.pid"), JSON.stringify({ pid: 1234, port: 4180, version: "0.5.2" }));
    expect(readPidFile(dir)).toMatchObject({ pid: 1234, port: 4180 });
    writeFileSync(path.join(dir, "server.pid"), "garbage");
    expect(readPidFile(dir)).toBeNull();
  });
});

describe("dependency state", () => {
  const install = (dir: string, lock: string, stamp: string | null, files = REQUIRED_FILES) => {
    writeFileSync(path.join(dir, "package-lock.json"), lock);
    mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    for (const f of files) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), "{}");
    }
    if (stamp !== null) writeFileSync(path.join(dir, "node_modules", ".qt-deps-stamp"), stamp + "\n");
  };

  it("installs on first run and after the lockfile changes", () => {
    const dir = temp();
    install(dir, "{}", null);
    const first = depsState(dir);
    expect(first.state).toBe("install");
    writeFileSync(path.join(dir, "node_modules", ".qt-deps-stamp"), first.hash + "\n");
    expect(depsState(dir).state).toBe("current");
    writeFileSync(path.join(dir, "package-lock.json"), '{"changed":true}');
    expect(depsState(dir).state).toBe("install");
  });

  it("repairs a stamped install that lost files", () => {
    const dir = temp();
    install(dir, "{}", null, REQUIRED_FILES.slice(1));
    writeFileSync(path.join(dir, "node_modules", ".qt-deps-stamp"), depsState(dir).hash + "\n");
    expect(depsState(dir)).toMatchObject({ state: "repair", missing: [REQUIRED_FILES[0]] });
  });
});

describe("what's new after an update", () => {
  const CHANGELOG = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "- Not released yet.",
    "",
    "## v0.6.0 — 2026-12-01",
    "",
    "- **Deriv** feed (no account, see `DERIV:EURUSD`): live forex; more details here. And more.",
    "- `Start Terminal (Deriv FX).cmd` (or `QT_FX_PROVIDER=deriv`): FX from Deriv.",
    "- A long entry that keeps going",
    "  on a second line of the file.",
    "",
    "## v0.5.2 — 2026-11-08",
    "",
    "- Shared launcher.",
    "",
    "## v0.5.1 — 2026-11-07",
    "",
    "- Older entry.",
  ].join("\n");

  it("parses versions and entries, joining continued lines and leaving Unreleased out", () => {
    const s = parseChangelog(CHANGELOG);
    expect(s.map((x) => [x.version, x.date, x.items.length])).toEqual([
      ["0.6.0", "2026-12-01", 3],
      ["0.5.2", "2026-11-08", 1],
      ["0.5.1", "2026-11-07", 1],
    ]);
    expect(s[0].items[2]).toBe("A long entry that keeps going on a second line of the file.");
    expect(sectionsBetween(s, "0.5.1", "0.6.0").map((x) => x.version)).toEqual(["0.6.0", "0.5.2"]);
  });

  it("summarizes an entry to its first sentence without markdown or side notes", () => {
    const [first, second] = parseChangelog(CHANGELOG)[0].items;
    expect(summarize(first)).toBe("Deriv feed: live forex.");
    expect(summarize(second)).toBe("Start Terminal (Deriv FX).cmd: FX from Deriv.");
    expect(summarize("x".repeat(20) + " word ".repeat(40), 60).length).toBeLessThanOrEqual(60);
  });

  it("draws a box with the versions in between, wrapped to the window", () => {
    const box = renderWhatsNew(sectionsBetween(parseChangelog(CHANGELOG), "0.5.1", "0.6.0"), { from: "0.5.1", to: "0.6.0", width: 60 });
    const lines = box.split("\n");
    expect(lines[0]).toMatch(/^┌─ What's new: v0\.5\.1 → v0\.6\.0 ─+$/);
    expect(lines.at(-1)).toMatch(/^└─ Full list: CHANGELOG\.md ─+$/);
    expect(box).toContain("│ v0.6.0  2026-12-01");
    expect(box).toContain("│   • Shared launcher.");
    expect(box).not.toContain("Older entry");
    expect(lines.every((l) => l.length <= 60)).toBe(true);
    expect(box).not.toMatch(/\x1b\[/);
    expect(renderWhatsNew([], {})).toBe("");
    expect(renderWhatsNew(parseChangelog(CHANGELOG), { from: "0", to: "1", color: true })).toMatch(/\x1b\[1;33mv0\.6\.0/);
  });

  it("caps the number of entries and versions", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ version: `0.${9 - i}.0`, date: "", items: Array.from({ length: 9 }, (_, j) => `Entry ${j}.`) }));
    const box = renderWhatsNew(many, { from: "0.3.0", to: "0.9.0", maxVersions: 2, maxItems: 3 });
    expect(box).toContain("… and 6 more");
    expect(box).toContain("… and 4 earlier release(s)");
    expect(box.match(/• /g)).toHaveLength(6);
  });

  it("uses the real changelog for an update", () => {
    expect(whatsNew("0.4.0", "0.5.0", { isTTY: false, columns: 100 })).toContain("Deriv data feed");
    expect(whatsNew("0.5.0", "0.5.0")).toBe("");
    expect(whatsNew("", "0.5.0")).toBe("");
  });
});

describe("replaced instances", () => {
  it("tells a window its server was replaced by a newer start, but only for a recent note", () => {
    const dir = temp();
    expect(replacedBy(dir, 0)).toBeNull();
    writeReplacedNote(dir, { by: "0.6.0", at: 1_000_000 });
    expect(replacedBy(dir, 999_000, 1_001_000)).toBe("0.6.0");
    expect(replacedBy(dir, 1_000_001, 1_001_000)).toBeNull(); // note older than this window's start
    expect(replacedBy(dir, 0, 1_000_000 + 10 * 60_000)).toBeNull(); // stale
  });
});
