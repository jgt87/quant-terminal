import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";
import { defaultWorkspace } from "../src/workspace/routes";

let server: Server;
let base: string;
let dir: string;
const market = {
  async quotes(symbols: string[]) {
    return symbols.filter((s) => s === "AAPL").map((s) => ({ symbol: s, last: 100, change: 1, changePct: 1, time: 0 }));
  },
} as unknown as MarketData;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-workspace-"));
  server = createServer(createApp({ market, store: new Store(dir) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const call = async (p: string, method = "GET", body?: unknown) => {
  const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

describe("workspace", () => {
  it("default on first GET (not written to disk)", async () => {
    const r = await call("/api/workspace");
    expect(r.body).toEqual(defaultWorkspace());
    expect(r.body.tabs).toEqual([{ id: "main", name: "Main", grid: "1", cells: [{ layoutId: "default" }] }]);
    expect(r.body.linkGroups).toHaveLength(9);
    expect(r.body.linkGroups.every((g: any) => g.symbol && !g.interval && !g.time)).toBe(true);
    expect(r.body.crosshairSync).toBe(false);
    expect(await readdir(dir).catch(() => [])).not.toContain("workspace.json");
  });

  it("PUT with baseUpdatedAt: saves, then 409 with the stored workspace on a stale base", async () => {
    const ws = { ...defaultWorkspace(), tabs: [{ id: "main", name: "Main", grid: "4", cells: [{ layoutId: "default" }, { layoutId: "c2", link: "red" }] }], crosshairSync: true };
    const first = await call("/api/workspace", "PUT", { ...ws, baseUpdatedAt: 0 });
    expect(first.status).toBe(200);
    expect(first.body.updatedAt).toBeGreaterThan(0);
    expect(first.body.tabs[0].grid).toBe("4");
    const second = await call("/api/workspace", "PUT", { ...ws, crosshairSync: false, baseUpdatedAt: first.body.updatedAt });
    expect(second.status).toBe(200);
    expect(second.body.updatedAt).toBeGreaterThan(first.body.updatedAt);
    const stale = await call("/api/workspace", "PUT", { ...ws, baseUpdatedAt: first.body.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("conflict");
    expect(stale.body.workspace.crosshairSync).toBe(false);
    expect((await call("/api/workspace")).body.updatedAt).toBe(second.body.updatedAt);
    // without a base it always writes
    expect((await call("/api/workspace", "PUT", ws)).status).toBe(200);
  });

  it("validation", async () => {
    const ws = defaultWorkspace();
    for (const bad of [
      { ...ws, tabs: [] },
      { ...ws, activeTab: "nope" },
      { ...ws, tabs: [{ ...ws.tabs[0], grid: "5" }] },
      { ...ws, tabs: [{ ...ws.tabs[0], cells: [{ layoutId: "../x" }] }] },
      { ...ws, tabs: [{ ...ws.tabs[0], cells: [{ layoutId: "a", link: "black" }] }] },
      { ...ws, tabs: [ws.tabs[0], ws.tabs[0]] },
      { ...ws, linkGroups: [{ color: "red", symbol: true, interval: false }] },
      { ...ws, crosshairSync: "yes" },
      { ...ws, baseUpdatedAt: "x" },
    ]) {
      expect((await call("/api/workspace", "PUT", bad)).status, JSON.stringify(bad).slice(0, 120)).toBe(400);
    }
  });
});

describe("scripts", () => {
  it("CRUD with a summary list", async () => {
    const created = await call("/api/scripts", "POST", { name: "My RSI", kind: "indicator", source: "plot(rsi(close, 14))" });
    expect(created.body).toMatchObject({ name: "My RSI", kind: "indicator", source: "plot(rsi(close, 14))" });
    const id = created.body.id;
    const list = await call("/api/scripts");
    expect(list.body).toEqual([{ id, name: "My RSI", kind: "indicator", updatedAt: created.body.updatedAt, size: 20 }]);
    expect((await call(`/api/scripts/${id}`)).body.source).toBe("plot(rsi(close, 14))");
    const put = await call(`/api/scripts/${id}`, "PUT", { name: "Renamed", kind: "strategy", source: "x" });
    expect(put.body).toMatchObject({ id, name: "Renamed", kind: "strategy", source: "x" });
    expect((await call(`/api/scripts/${id}`, "DELETE")).body).toEqual({ ok: true });
    expect((await call(`/api/scripts/${id}`)).status).toBe(404);
    expect((await call(`/api/scripts/${id}`, "DELETE")).status).toBe(404);
  });

  it("validates kind, name, size and ids", async () => {
    expect((await call("/api/scripts", "POST", { name: "x", kind: "macro", source: "" })).status).toBe(400);
    expect((await call("/api/scripts", "POST", { name: "", kind: "indicator", source: "" })).status).toBe(400);
    expect((await call("/api/scripts", "POST", { name: "big", kind: "indicator", source: "x".repeat(200 * 1024 + 1) })).status).toBe(400);
    expect((await call("/api/scripts", "POST", { name: "ok", kind: "indicator", source: "x".repeat(200 * 1024) })).status).toBe(200);
    expect((await call("/api/scripts/abc", "PUT", { id: "other", name: "x", kind: "indicator", source: "" })).status).toBe(400);
    expect((await call("/api/scripts/a.b", "GET")).status).toBe(400);
  });
});

describe("paper routes", () => {
  it("account lifecycle over HTTP", async () => {
    const acc = await call("/api/paper", "POST", { balance: 1000 });
    expect(acc.body.balance).toBe(1000);
    const id = acc.body.id;
    const buy = await call(`/api/paper/${id}/orders`, "POST", { symbol: "AAPL", side: "buy", qty: 2 });
    expect(buy.body.order.status).toBe("filled");
    expect(buy.body.account.equity).toBe(1000);
    expect((await call("/api/paper")).body).toHaveLength(1);
    const close = await call(`/api/paper/${id}/close/AAPL`, "POST");
    expect(close.body.account.positions).toEqual({});
    const lim = await call(`/api/paper/${id}/orders`, "POST", { symbol: "AAPL", side: "buy", type: "limit", price: 50, qty: 1 });
    expect((await call(`/api/paper/${id}/orders/${lim.body.order.id}`, "DELETE")).body.status).toBe("cancelled");
    expect((await call(`/api/paper/${id}/reset`, "POST")).body.orders).toEqual([]);
    expect((await call(`/api/paper/${id}`)).body.equity).toBe(1000);
    expect((await call(`/api/paper/${id}`, "DELETE")).body).toEqual({ ok: true });
    expect((await call(`/api/paper/${id}`)).status).toBe(404);
  });
});
