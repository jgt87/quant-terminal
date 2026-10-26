import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MarketData } from "../src/providers";
import { planStream, rewriteLine } from "../src/routes/stream";
import { Store } from "../src/store";

const SYMBOLS = [
  { symbol: "EURUSD", description: "Euro", path: "Forex\Majors\EURUSD", digits: 5, currency: "USD" },
  { symbol: "AAPL.NAS", description: "Apple CFD", path: "Stock CFD's\Nasdaq\AAPL.NAS", digits: 3, currency: "USD" },
];
let streamedNames: string[] = [];

/** Fake MT5 bridge: symbol search and an SSE stream that emits one tick per requested name. */
const bridgeFetch = (async (input: string) => {
  const url = new URL(input);
  if (url.pathname === "/symbols") {
    const q = (url.searchParams.get("q") ?? "").toUpperCase();
    return new Response(JSON.stringify(SYMBOLS.filter((s) => s.symbol.toUpperCase().includes(q))), { status: 200 });
  }
  if (url.pathname === "/stream") {
    streamedNames = (url.searchParams.get("symbols") ?? "").split(",");
    const body = new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        c.enqueue(enc.encode(`event: errors\ndata: {"symbols": []}\n\n`));
        for (const s of streamedNames) c.enqueue(enc.encode(`event: tick\ndata: ${JSON.stringify({ symbol: s, bid: 1.1, ask: 1.2, last: 1.1, time: 100, timeMs: 100000 })}\n\n`));
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  return new Response(JSON.stringify({ error: "no stub" }), { status: 500 });
}) as never;

let server: Server;
let base: string;
let dir: string;
let market: MarketData;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-stream-"));
  market = new MarketData({ fetchFn: bridgeFetch, fxProvider: "mt5", mt5BridgeUrl: "http://bridge.test" });
  server = createServer(createApp({ market, store: new Store(path.join(dir, "store")) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

/** Reads SSE frames until `n` tick events arrived (or the stream ends). */
async function readFrames(url: string, ticks: number): Promise<{ event: string; data: any }[]> {
  const ctrl = new AbortController();
  const res = await fetch(url, { signal: ctrl.signal });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const frames: { event: string; data: any }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (ev && data) frames.push({ event: ev, data: JSON.parse(data) });
    }
    const n = frames.filter((f) => f.event === "tick").length;
    if (ticks === 0 ? frames.some((f) => f.event === "errors") : n >= ticks) break;
  }
  ctrl.abort();
  return frames;
}

describe("live stream isolation", () => {
  it("resolves symbols one by one and reports the failures", async () => {
    const plan = await planStream(market, ["MT5:EURUSD", "MT5:NOPE", "AAPL", "EURUSD=X", "bad symbol!"]);
    expect([...plan.names.entries()]).toEqual([["EURUSD", ["MT5:EURUSD", "EURUSD=X"]]]);
    expect(plan.errors.map((e) => e.symbol)).toEqual(["MT5:NOPE", "AAPL", "bad symbol!"]);
    expect(plan.bridgeDown).toBe(false);
  });

  it("an unknown symbol does not kill the shared stream: errors frame first, then ticks", async () => {
    const frames = await readFrames(`${base}/api/stream?symbols=${encodeURIComponent("MT5:EURUSD,MT5:NOPE,MT5:AAPL.NAS")}`, 2);
    expect(frames[0]).toEqual({ event: "errors", data: { errors: [{ symbol: "MT5:NOPE", error: expect.stringContaining("NOPE") }] } });
    expect(streamedNames.sort()).toEqual(["AAPL.NAS", "EURUSD"]);
    const ticks = frames.filter((f) => f.event === "tick").map((f) => f.data);
    expect(ticks.map((t) => [t.symbol, t.ids])).toEqual([
      ["MT5:EURUSD", ["MT5:EURUSD"]],
      ["MT5:AAPL.NAS", ["MT5:AAPL.NAS"]],
    ]);
  });

  it("ticks carry every requested alias (canonical matching, broker suffixes included)", async () => {
    const frames = await readFrames(`${base}/api/stream?symbols=${encodeURIComponent("EURUSD=X,MT5:EURUSD")}`, 1);
    expect(frames.find((f) => f.event === "tick")!.data.ids).toEqual(["EURUSD=X", "MT5:EURUSD"]);
  });

  it("only unknown symbols: still an SSE response with the errors frame (no reconnect storm)", async () => {
    const frames = await readFrames(`${base}/api/stream?symbols=MT5:NOPE`, 0);
    expect(frames[0].event).toBe("errors");
    expect(frames[0].data.errors[0].symbol).toBe("MT5:NOPE");
  });

  it("sends exactly one errors frame (pre-stream failures merged into the bridge's frame)", async () => {
    const frames = await readFrames(`${base}/api/stream?symbols=${encodeURIComponent("MT5:EURUSD,MT5:NOPE")}`, 1);
    const errs = frames.filter((f) => f.event === "errors");
    expect(errs).toHaveLength(1);
    expect(errs[0].data.errors.map((e: { symbol: string }) => e.symbol)).toEqual(["MT5:NOPE"]);
  });

  it("merges known failures into upstream error frames", () => {
    const names = new Map([["EURUSD", ["MT5:EURUSD"]]]);
    const known = [{ symbol: "MT5:NOPE", error: "Unknown symbol" }];
    expect(JSON.parse(rewriteLine('data: {"symbols":["XYZ"]}', "errors", names, known)!.slice(6)).errors.map((e: { symbol: string }) => e.symbol)).toEqual(["MT5:NOPE", "MT5:XYZ"]);
    expect(JSON.parse(rewriteLine('data: {"symbols":[]}', "errors", names, known)!.slice(6)).errors).toEqual(known);
  });

  it("rewrites upstream error frames to the requested ids", () => {
    const names = new Map([["AAPL.NAS", ["MT5:aapl.nas"]]]);
    expect(rewriteLine('data: {"symbols":["AAPL.NAS"]}', "errors", names)).toBe('data: {"errors":[{"symbol":"MT5:aapl.nas","error":"Unknown MT5 symbol: AAPL.NAS"}]}');
    expect(rewriteLine("event: tick", "tick", names)).toBeNull();
  });
});
