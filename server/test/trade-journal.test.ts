import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";
import { validateTradeNote } from "../src/tradeJournal";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-journal-"));
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

describe("trade journal API", () => {
  it("starts empty, saves a note per trade and removes an emptied one", async () => {
    expect(await call("/api/trade-journal")).toEqual({ status: 200, body: { notes: {} } });
    const put = await call("/api/trade-journal/acc1:f1", "PUT", { note: "Clean breakout", tags: ["breakout", " plan "] });
    expect(put.status).toBe(200);
    expect(put.body.notes["acc1:f1"]).toMatchObject({ note: "Clean breakout", tags: ["breakout", "plan"] });
    await call("/api/trade-journal/acc1:f2", "PUT", { note: "Chased it" });
    expect(Object.keys((await call("/api/trade-journal")).body.notes)).toEqual(["acc1:f1", "acc1:f2"]);
    await call("/api/trade-journal/acc1:f1", "PUT", { note: " ", tags: [] });
    expect(Object.keys((await call("/api/trade-journal")).body.notes)).toEqual(["acc1:f2"]);
  });

  it("rejects bad keys and notes", async () => {
    expect((await call("/api/trade-journal/a%20b", "PUT", { note: "x" })).status).toBe(400);
    expect((await call("/api/trade-journal/k", "PUT", { note: 5 })).status).toBe(400);
    expect((await call("/api/trade-journal/k", "PUT", { tags: Array(11).fill("t") })).status).toBe(400);
    expect(() => validateTradeNote({ note: "x".repeat(2001) }, 0)).toThrow(/note/);
  });
});
