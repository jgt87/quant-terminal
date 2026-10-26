import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";
import { validateLayout } from "../src/validate";
import { validateDrawingTemplates } from "../src/drawings/templates";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-templates-"));
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

describe("drawing templates API", () => {
  it("GET is empty before the first save", async () => {
    expect(await call("/api/drawing-templates")).toEqual({ status: 200, body: {} });
  });

  it("PUT stores the document and GET returns it", async () => {
    const doc = {
      trendline: { default: { style: { color: "#ff0000", width: 2 } }, saved: [{ name: "Red", style: { color: "#ff0000" }, props: { extendRight: true } }] },
      fib: { saved: [] },
    };
    const put = await call("/api/drawing-templates", "PUT", doc);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(doc);
    expect((await call("/api/drawing-templates")).body).toEqual(doc);
  });

  it("rejects malformed documents", async () => {
    expect((await call("/api/drawing-templates", "PUT", [])).status).toBe(400);
    expect((await call("/api/drawing-templates", "PUT", { "bad type!": { saved: [] } })).status).toBe(400);
    expect((await call("/api/drawing-templates", "PUT", { ray: { saved: [{ name: "", style: {} }] } })).status).toBe(400);
    expect((await call("/api/drawing-templates", "PUT", { ray: { saved: [{ name: "A", style: {} }, { name: "A", style: {} }] } })).status).toBe(400);
    expect((await call("/api/drawing-templates", "PUT", { ray: { saved: [], default: { style: "red" } } })).status).toBe(400);
  });

  it("validator drops unknown keys and keeps props", () => {
    expect(validateDrawingTemplates({ ray: { saved: [{ name: "X", style: { width: 1 }, extra: 1 }], junk: true } })).toEqual({ ray: { saved: [{ name: "X", style: { width: 1 } }] } });
  });
});

describe("layout validation accepts registry-era drawing fields", () => {
  const layout = (drawings: unknown, extra: Record<string, unknown> = {}) => ({
    name: "L",
    symbol: "AAPL",
    interval: "1D",
    chartType: "candles",
    logScale: false,
    indicators: [],
    drawings: { AAPL: drawings },
    ...extra,
  });

  it("points, props, groupId, zIndex, templateName, name and groups", () => {
    const l = validateLayout(
      "x",
      layout(
        [{ id: "d1", type: "brush", anchors: [], points: [{ time: 1, price: 2 }], props: { a: 1 }, groupId: "g1", zIndex: 3, templateName: "T", name: "My line" }],
        { groups: [{ id: "g1", name: "Group 1", symbol: "AAPL" }] },
      ),
    );
    expect(l.drawings.AAPL[0].points).toHaveLength(1);
    expect(l.groups).toEqual([{ id: "g1", name: "Group 1", symbol: "AAPL" }]);
  });

  it("rejects bad optional fields", () => {
    expect(() => validateLayout("x", layout([{ id: "d", type: "x", anchors: [], points: "no" }]))).toThrow();
    expect(() => validateLayout("x", layout([{ id: "d", type: "x", anchors: [], zIndex: "1" }]))).toThrow();
    expect(() => validateLayout("x", layout([], { groups: [{ id: "", name: "n", symbol: "AAPL" }] }))).toThrow();
  });
});
