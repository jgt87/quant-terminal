import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createApp } from "./app";
import { MarketData, type FxProvider } from "./providers";
import { defaultDerivSocket } from "./providers/deriv";
import { Store } from "./store";
import path from "node:path";
import { APP_VERSION, CACHE_DIR, DATA_DIR, PID_FILE, STORE_DIR, WEB_DIST_DIR } from "./paths";
import fs from "node:fs";

const port = Number(process.env.PORT) || 4180;
// Loopback only by default (IPv4 and IPv6, so "localhost" works either way). HOST=0.0.0.0 exposes it.
const hosts = process.env.HOST ? [process.env.HOST] : ["127.0.0.1", "::1"];
const url = `http://localhost:${port}/`;

/** QT_OPEN_BROWSER=1 (set by the launchers): open the app once the server is actually listening. */
function openBrowser(): void {
  if (process.env.QT_OPEN_BROWSER !== "1") return;
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", '""', url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: true }).on("error", () => {}).unref();
  } catch { /* no browser available: the URL is printed above */ }
}

const app = createApp({
  market: new MarketData({
    cacheDir: CACHE_DIR,
    fxProvider: (["mt5", "deriv"].includes(process.env.QT_FX_PROVIDER ?? "") ? process.env.QT_FX_PROVIDER : "yahoo") as FxProvider,
    mt5BridgeUrl: process.env.MT5_BRIDGE_URL,
    derivSocket: defaultDerivSocket,
  }),
  store: new Store(STORE_DIR),
  webDist: WEB_DIST_DIR,
  depthDir: path.join(DATA_DIR, "depth"),
  background: process.env.QT_BACKGROUND !== "0",
});

const servers = hosts.map((host, i) => {
  const server = createServer(app);
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (i > 0 && (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT")) return; // no IPv6 loopback
    if (err.code === "EADDRINUSE") {
      console.error(`[server] port ${port} is already in use. Quant Terminal may already be running at ${url}`);
      console.error(`[server] close the other window, or start on another port with PORT=<number>.`);
      openBrowser(); // most likely the terminal itself: show it
    } else {
      console.error(`[server] cannot listen on ${host}:${port}: ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    if (i === 0) {
      console.log(`[server] Quant Terminal API on ${url}`);
      writePidFile();
      openBrowser();
    }
  });
  return server;
});

/** Lets the launcher find this server (to open it, or to replace it after an update). */
function writePidFile(): void {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, port, version: APP_VERSION, started: Date.now() }) + "\n");
  } catch { /* the launcher then only knows the port */ }
}

function removePidFile(): void {
  try {
    if (JSON.parse(fs.readFileSync(PID_FILE, "utf8")).pid === process.pid) fs.unlinkSync(PID_FILE);
  } catch { /* not ours or already gone */ }
}

const shutdown = () => {
  removePidFile();
  let open = servers.length;
  for (const s of servers) s.close(() => --open === 0 && process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
