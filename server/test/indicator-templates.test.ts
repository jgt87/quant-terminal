import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";
import { validateIndicatorTemplates } from "../src/indicatorTemplates";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-ind-templates-"));
  server = createServer(createApp({ market: {} as unknown as MarketData, store: new Store(dir) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const call = async (p: string, method = "GET", body?: unknown) => {
  const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

const sma = { uid: "a", indicatorId: "sma", inputs: { length: 20 }, visible: true };

describe("indicator templates API", () => {
  it("GET is empty before the first save", async () => {
    expect(await call("/api/indicator-templates")).toEqual({ status: 200, body: { saved: [] } });
  });

  it("PUT stores the document and GET returns it", async () => {
    const doc = { saved: [{ name: "Trend", indicators: [sma] }] };
    expect(await call("/api/indicator-templates", "PUT", doc)).toEqual({ status: 200, body: doc });
    expect((await call("/api/indicator-templates")).body).toEqual(doc);
  });

  it("rejects malformed documents", async () => {
    const bad = [
      [],
      { saved: {} },
      { saved: [{ name: "", indicators: [] }] },
      { saved: [{ name: "A", indicators: [] }, { name: "A", indicators: [] }] },
      { saved: [{ name: "A", indicators: [{ uid: 1 }] }] },
    ];
    for (const b of bad) expect((await call("/api/indicator-templates", "PUT", b)).status).toBe(400);
  });

  it("validator drops unknown keys", () => {
    expect(validateIndicatorTemplates({ saved: [{ name: "X", indicators: [sma], extra: 1 }], junk: true })).toEqual({ saved: [{ name: "X", indicators: [sma] }] });
  });
});
