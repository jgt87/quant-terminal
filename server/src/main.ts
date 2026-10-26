import { createServer } from "node:http";
import { createApp } from "./app";
import { MarketData } from "./providers";
import { Store } from "./store";
import { CACHE_DIR, STORE_DIR, WEB_DIST_DIR } from "./paths";

const port = Number(process.env.PORT) || 4180;
// Loopback only by default (IPv4 and IPv6, so "localhost" works either way). HOST=0.0.0.0 exposes it.
const hosts = process.env.HOST ? [process.env.HOST] : ["127.0.0.1", "::1"];

const app = createApp({
  market: new MarketData({
    cacheDir: CACHE_DIR,
    fxProvider: process.env.QT_FX_PROVIDER === "mt5" ? "mt5" : "yahoo",
    mt5BridgeUrl: process.env.MT5_BRIDGE_URL,
  }),
  store: new Store(STORE_DIR),
  webDist: WEB_DIST_DIR,
  background: process.env.QT_BACKGROUND !== "0",
});

const servers = hosts.map((host, i) => {
  const server = createServer(app);
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (i > 0 && (err.code === "EADDRNOTAVAIL" || err.code === "EAFNOSUPPORT")) return; // no IPv6 loopback
    console.error(`[server] cannot listen on ${host}:${port}: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    if (i === 0) console.log(`[server] Quant Terminal API on http://localhost:${port}`);
  });
  return server;
});

const shutdown = () => {
  let open = servers.length;
  for (const s of servers) s.close(() => --open === 0 && process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
