// The Quant Terminal launcher. Every "Start Terminal*.cmd" is a short stub that runs this one
// module with its mode, so updating, checking and starting work the same way in all of them:
//
//   1. Update: a git checkout fast-forwards to the newest release tag (tools/update.mjs); after an
//      update this launcher hands over to the new version's launcher, so its own changes (new
//      checks, new steps) apply in the same start. A ZIP install is told when a newer release exists.
//   2. Check this computer: Node.js for the mode, npm, Git, and per mode the MT5 bridge's Python and
//      terminal or Deriv's reachability. Missing essentials stop the start with what to install.
//   3. A Quant Terminal that is already running: the same version is opened in the browser; an
//      older one (still serving its old code after an update) is stopped and this version starts.
//   4. Dependencies (npm ci when package-lock.json changed or files are missing), the MT5 bridge
//      when asked for, the build, and the server, which opens the browser once it listens.
//
// Usage: node tools/launch.mjs [--fx yahoo|mt5|deriv] [--check] [--no-update] [--no-browser]
//   --check       only the update check and the computer check (changes nothing; exit 1 on a FAIL)
//   --no-update   skip the update (also QT_NO_UPDATE=1)
//   --no-browser  do not open the browser
// Exit code 0 when the server stopped normally, 1 on a problem (the .cmd stub then keeps its window open).
import { spawn, spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkLatestRelease, updateGitCheckout } from "./update.mjs";
import { ensureDeps } from "./ensure-deps.mjs";
import { parseChangelog, renderWhatsNew, sectionsBetween } from "./changelog.mjs";

const HERE = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(HERE), "..");

/** Parse launcher arguments. Unknown ones are returned so the caller can say so. */
export function parseArgs(argv) {
  const out = { fx: "yahoo", check: false, noUpdate: false, noBrowser: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i].toLowerCase();
    if (a === "--fx") {
      const v = (argv[++i] ?? "").toLowerCase();
      if (v === "yahoo" || v === "mt5" || v === "deriv") out.fx = v;
      else out.unknown.push(`--fx ${argv[i] ?? ""}`.trim());
    } else if (a === "--check") out.check = true;
    else if (a === "--no-update") out.noUpdate = true;
    else if (a === "--no-browser") out.noBrowser = true;
    else out.unknown.push(argv[i]);
  }
  return out;
}

/** Node.js versions this release runs on: Vite 8 needs 20.19+ or 22.12+; Deriv's feed needs 22+ (built-in WebSocket). */
export function nodeSupported(version, fx = "yahoo") {
  const [a, b] = String(version).replace(/^v/, "").split(".").map(Number);
  if (fx === "deriv") return (a === 22 && b >= 12) || a >= 23;
  return (a === 20 && b >= 19) || (a === 22 && b >= 12) || a >= 23;
}

export function nodeRequirement(fx = "yahoo") {
  return fx === "deriv" ? "22.12 or newer" : "20.19+ or 22.12+";
}

/** One line of the computer check. */
const check = (status, name, detail) => ({ status, name, detail });

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { cwd: ROOT, encoding: "utf8", shell: true, windowsHide: true, timeout: 15000, ...opts });
  return { ok: r.status === 0 && !r.error, out: `${r.stdout ?? ""}`.trim() };
}

const bridgeReady = () => fs.existsSync(path.join(ROOT, "bridge", ".venv", "Lib", "site-packages", "MetaTrader5"));

/** What this computer has for the mode. Read-only and quick (one DNS lookup for Deriv). */
export async function computerChecks(fx, { nodeVersion = process.versions.node, isGit = fs.existsSync(path.join(ROOT, ".git")) } = {}) {
  const checks = [];
  checks.push(
    nodeSupported(nodeVersion, fx)
      ? check("OK", "Node.js", nodeVersion)
      : check("FAIL", "Node.js", `${nodeVersion} is not supported${fx === "deriv" ? " for the Deriv feed" : ""}. Install the current LTS of Node.js (${nodeRequirement(fx)}) from https://nodejs.org`),
  );
  const npm = run("npm -v");
  checks.push(npm.ok ? check("OK", "npm", npm.out) : check("FAIL", "npm", "not found. It comes with Node.js: reinstall Node.js from https://nodejs.org"));
  if (isGit) {
    const git = run("git --version");
    checks.push(git.ok ? check("OK", "Git", git.out.replace(/^git version /, "")) : check("WARN", "Git", "not found: automatic updates are off. Install it from https://git-scm.com"));
  } else {
    checks.push(check("INFO", "Updates", "installed from a ZIP: new releases are announced, not installed. Install with git clone to update automatically."));
  }
  if (fx === "mt5" && process.platform === "win32") {
    if (bridgeReady()) checks.push(check("OK", "MT5 bridge", "Python environment ready"));
    else if (run("py -3.12-64 -c \"\"").ok) checks.push(check("OK", "MT5 bridge", "Python 3.12 found; the bridge environment is set up during this start"));
    else checks.push(check("FAIL", "MT5 bridge", "needs 64-bit Python 3.12: install it from https://www.python.org/downloads/ (keep \"py launcher\" checked)"));
    const tasks = run('tasklist /FI "IMAGENAME eq terminal64.exe" /NH');
    checks.push(
      /terminal64\.exe/i.test(tasks.out)
        ? check("OK", "MetaTrader 5", "running")
        : check("WARN", "MetaTrader 5", "not running: open MT5 and log in, or MT5 symbols stay empty"),
    );
  }
  if (fx === "deriv") {
    try {
      await Promise.race([dns.lookup("api.derivws.com"), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 3000).unref())]);
      checks.push(check("OK", "Deriv", "api.derivws.com reachable"));
    } catch {
      checks.push(check("WARN", "Deriv", "api.derivws.com cannot be reached (offline or blocked): Deriv symbols will not load"));
    }
  }
  return checks;
}

export function formatChecks(checks) {
  return checks.map((c) => `  ${c.status.padEnd(4)} ${c.name}: ${c.detail}`).join("\n");
}

/** Whether something accepts connections on the port (IPv4 or IPv6 loopback; the server binds both). */
export async function portBusy(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const s = net.connect({ port, host });
      const done = (busy) => {
        s.destroy();
        resolve(busy);
      };
      s.once("connect", () => done(true));
      s.once("error", () => done(false));
      s.setTimeout(1500, () => done(false));
    });
  return (await tryHost("127.0.0.1")) || (await tryHost("::1"));
}

/** What answers on the port: { app: "quant-terminal", version } (version "" before v0.5.2), or null for another program. */
export async function probeTerminal(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2500) });
    const body = await res.json();
    if (body?.app === "quant-terminal") return { app: body.app, version: String(body.version ?? "") };
    if (body && body.ok === true && Object.keys(body).length === 1) return { app: "quant-terminal", version: "" };
  } catch {
    /* not HTTP, not JSON or no answer */
  }
  return null;
}

/** The server's pid file ({ pid, port, version }) or null. */
export function readPidFile(dataDir) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dataDir, "server.pid"), "utf8"));
    return Number.isInteger(v.pid) && v.pid > 0 ? v : null;
  } catch {
    return null;
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Stop the recorded server on `port` and wait until the port is free. True when it is. */
async function stopRecorded(rec, port) {
  if (!rec || rec.port !== port || !alive(rec.pid)) return false;
  try {
    process.kill(rec.pid);
  } catch {
    return false;
  }
  for (let i = 0; i < 40; i++) {
    if (!(await portBusy(port))) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", '""', url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: true }).on("error", () => {}).unref();
  } catch {
    /* the URL is printed */
  }
}

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/** Version in package.json at a git revision (ORIG_HEAD: before the last fast-forward), or "". */
function versionAt(rev) {
  const r = spawnSync("git", ["show", `${rev}:package.json`], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 10000 });
  try {
    return r.status === 0 ? String(JSON.parse(r.stdout).version ?? "") : "";
  } catch {
    return "";
  }
}

/** The "What's new" box for an update from `from` to `to`, or "" (unknown version, no entries, no changelog). */
export function whatsNew(from, to, out = process.stdout) {
  if (!from || !to || from === to) return "";
  let text;
  try {
    text = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  } catch {
    return "";
  }
  const sections = sectionsBetween(parseChangelog(text), from, to);
  const color = Boolean(out.isTTY) && !process.env.NO_COLOR;
  return renderWhatsNew(sections, { from, to, width: out.columns || 100, color });
}

/** Note left for the window of a server this launcher stops, so it can say it was replaced. */
export function writeReplacedNote(dataDir, note) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "server.replaced.json"), JSON.stringify(note) + "\n");
  } catch {
    /* the old window then reports a plain stop */
  }
}

/** The replacing version when this window's server was stopped by a newer start (after `since`, ms), else null. */
export function replacedBy(dataDir, since, now = Date.now()) {
  try {
    const n = JSON.parse(fs.readFileSync(path.join(dataDir, "server.replaced.json"), "utf8"));
    return n.at >= since && now - n.at < 5 * 60_000 ? String(n.by ?? "") : null;
  } catch {
    return null;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const startedAt = Date.now();
  const args = parseArgs(argv);
  const say = (m) => console.log(m);
  const current = version();
  const label = { yahoo: "", mt5: " with live FX from MetaTrader 5", deriv: " with live FX from Deriv" }[args.fx];
  say(`Quant Terminal v${current}${label}`);
  if (args.unknown.length) say(`Ignoring unknown option(s): ${args.unknown.join(" ")}`);
  // Just updated (by this launcher or by an older one): what changed since the version updated from.
  if (env.QT_UPDATED === "1") {
    const from = env.QT_UPDATED_FROM || versionAt("ORIG_HEAD");
    const box = whatsNew(from, current);
    if (box) say(box);
  }

  // 1. Update, then hand over to the updated launcher.
  if (!args.noUpdate && env.QT_NO_UPDATE !== "1" && env.QT_UPDATED !== "1") {
    if (fs.existsSync(path.join(ROOT, ".git"))) {
      const r = updateGitCheckout(ROOT);
      say(`[update] ${r.message}`);
      if (r.status === "updated") {
        say("Starting the updated version...");
        const child = spawnSync(process.execPath, [HERE, ...argv], {
          cwd: ROOT,
          stdio: "inherit",
          env: { ...env, QT_UPDATED: "1", QT_UPDATED_FROM: r.from ?? "" },
        });
        return child.status ?? 1;
      }
    } else {
      const r = await checkLatestRelease(ROOT);
      say(`[update] ${r.message}`);
    }
  }

  // 2. This computer.
  const checks = await computerChecks(args.fx);
  say("Checking this computer:");
  say(formatChecks(checks));
  const failed = checks.some((c) => c.status === "FAIL");

  // 3. Already running?
  const port = Number(env.PORT) || 4180;
  const url = `http://localhost:${port}/`;
  const dataDir = env.QT_DATA_DIR ? path.resolve(env.QT_DATA_DIR) : path.join(ROOT, "data");
  let replace = null;
  if (await portBusy(port)) {
    const running = await probeTerminal(port);
    if (!running) {
      say(`  FAIL Port ${port}: used by another program. Close it, or start on another port: set PORT=4181 before starting.`);
      return 1;
    }
    if (running.version === current) {
      say(`  OK   Quant Terminal v${current} is already running at ${url}${args.check || args.noBrowser ? "" : " - opening it."}`);
      if (!args.check && !args.noBrowser) openBrowser(url);
      return failed ? 1 : 0;
    }
    replace = running;
    say(`  INFO Port ${port}: an older Quant Terminal (${running.version ? `v${running.version}` : "before v0.5.2"}) is running; it is replaced by this version.`);
  } else {
    say(`  OK   Port ${port}: free`);
  }
  if (args.check) {
    say(failed ? "Fix the FAIL items above, then start again." : "Everything Quant Terminal needs is in place.");
    return failed ? 1 : 0;
  }
  if (failed) {
    say("Quant Terminal cannot start until the FAIL items above are fixed.");
    return 1;
  }
  if (replace) {
    // A running server keeps serving the code it loaded; after an update the new version must take over.
    writeReplacedNote(dataDir, { by: current, at: Date.now() });
    if (await stopRecorded(readPidFile(dataDir), port)) say("Stopped the older Quant Terminal.");
    else {
      say(`The older Quant Terminal could not be stopped from here. Close its window, then start again.`);
      return 1;
    }
  }

  // 4. Dependencies, MT5 bridge, build, server.
  if (!ensureDeps(ROOT, say)) {
    say("Installing dependencies failed - see the messages above. Check your internet connection and try again.");
    return 1;
  }
  if (args.fx === "mt5") {
    if (!bridgeReady()) {
      say("Setting up the MT5 bridge (bridge\\.venv)...");
      if (spawnSync("cmd", ["/c", "bridge\\setup.cmd"], { cwd: ROOT, stdio: "inherit" }).status !== 0) {
        say("The MT5 bridge setup failed - see the messages above.");
        return 1;
      }
    }
    spawn("cmd", ["/c", "start", '"MT5 bridge"', "/min", "bridge\\.venv\\Scripts\\python.exe", "-I", "bridge\\mt5_bridge.py"], {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
      windowsVerbatimArguments: true,
    }).unref();
  }
  say("Building the app...");
  if (run("npm run build --silent", { stdio: "inherit", timeout: 600000, encoding: undefined }).ok === false) {
    say("Build failed - see the messages above.");
    return 1;
  }
  const serverEnv = { ...env, QT_OPEN_BROWSER: args.noBrowser ? "0" : "1" };
  if (args.fx !== "yahoo") serverEnv.QT_FX_PROVIDER = args.fx;
  const server = spawnSync("npm start --silent", { cwd: ROOT, stdio: "inherit", shell: true, env: serverEnv });
  if (server.status !== 0 && server.signal == null) {
    // Stopped by a newer version started from another window (after an update): not an error.
    const by = replacedBy(dataDir, startedAt);
    if (by) {
      say(`This Quant Terminal (v${current}) was replaced by v${by}, started from another window; it runs there now.`);
      return 0;
    }
    say("The server stopped with an error - see the messages above.");
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.log(`The launcher stopped: ${err?.stack ?? err}`);
      process.exit(1);
    },
  );
}
