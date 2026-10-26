import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Layout } from "@qt/core";
import { DEFAULT_WATCHLISTS, Store } from "../src/store";
import { writeJsonAtomic } from "../src/fsutil";
import { HttpError } from "../src/errors";
import { validateLayout, validateWatchlists } from "../src/validate";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const layout = (id: string, name = "L"): Layout => ({
  id, name, symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: {}, updatedAt: 0,
});

describe("writeJsonAtomic", () => {
  it("writes via a temp file and leaves no temp files behind", async () => {
    const file = path.join(dir, "a", "b.json");
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeJsonAtomic(file, { i, pad: "x".repeat(10_000) })));
    const parsed = JSON.parse(await readFile(file, "utf8"));
    expect(parsed.pad).toHaveLength(10_000);
    expect(await readdir(path.dirname(file))).toEqual(["b.json"]);
  });
});

describe("Store", () => {
  it("creates the default watchlist on first read and persists PUTs", async () => {
    const store = new Store(dir);
    expect(await store.getWatchlists()).toEqual(DEFAULT_WATCHLISTS);
    await store.putWatchlists([{ id: "x", name: "X", symbols: ["AAPL"] }]);
    expect(await new Store(dir).getWatchlists()).toEqual([{ id: "x", name: "X", symbols: ["AAPL"] }]);
  });

  it("round-trips layouts and lists them newest first", async () => {
    const store = new Store(dir);
    await store.putLayout({ ...layout("one", "One"), updatedAt: 1 });
    await store.putLayout({ ...layout("two", "Two"), updatedAt: 2 });
    expect(await store.listLayouts()).toEqual([
      { id: "two", name: "Two", updatedAt: 2 },
      { id: "one", name: "One", updatedAt: 1 },
    ]);
    expect((await store.getLayout("one"))?.name).toBe("One");
    expect(await store.deleteLayout("one")).toBe(true);
    expect(await store.deleteLayout("one")).toBe(false);
    expect(await store.getLayout("one")).toBeUndefined();
  });

  it.each(["../x", "..", "a/b", "a\\b", "x.json", "", "a".repeat(65), "C:evil", "%2e%2e"])("rejects id %j", (id) => {
    const store = new Store(dir);
    expect(() => store.layoutFile(id)).toThrow(HttpError);
  });

  it("saveLayout refuses a stale base and keeps updatedAt increasing", async () => {
    const store = new Store(dir);
    const a = await store.saveLayout({ ...layout("c"), updatedAt: 100 });
    expect(a.ok && a.layout.updatedAt).toBe(100);
    // Same-millisecond write still moves the stamp forward.
    const b = await store.saveLayout({ ...layout("c", "B"), updatedAt: 100 }, 100);
    expect(b.ok && b.layout.updatedAt).toBe(101);
    const stale = await store.saveLayout({ ...layout("c", "Stale"), updatedAt: 102 }, 100);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.current.name).toBe("B");
    expect((await store.getLayout("c"))?.name).toBe("B");
    // No stored layout yet: any base is accepted.
    expect((await store.saveLayout({ ...layout("d"), updatedAt: 5 }, 999)).ok).toBe(true);
  });

  it("keeps valid ids inside the layouts directory", () => {
    const store = new Store(dir);
    expect(path.dirname(store.layoutFile("Ab_9-z"))).toBe(path.join(dir, "layouts"));
  });
});

describe("validation", () => {
  it("validates watchlists", () => {
    expect(validateWatchlists([{ id: "a", name: "A", symbols: [" AAPL "] }])).toEqual([{ id: "a", name: "A", symbols: ["AAPL"] }]);
    expect(() => validateWatchlists({})).toThrow(HttpError);
    expect(() => validateWatchlists([{ id: "a", name: "A", symbols: [1] }])).toThrow(HttpError);
    expect(() => validateWatchlists([{ id: "a", name: "A", symbols: [] }, { id: "a", name: "B", symbols: [] }])).toThrow(/Duplicate/);
    expect(() => validateWatchlists([{ id: "../a", name: "A", symbols: [] }])).toThrow(HttpError);
  });

  it("validates layouts and stamps updatedAt", () => {
    const { id: _id, ...body } = layout("x");
    const out = validateLayout("x", body, 1234);
    expect(out.id).toBe("x");
    expect(out.updatedAt).toBe(1234);
    expect(() => validateLayout("x", { ...body, id: "y" })).toThrow(/match/);
    expect(() => validateLayout("x", { ...body, interval: "2h" })).toThrow(HttpError);
    expect(() => validateLayout("x", { ...body, chartType: "pie" })).toThrow(HttpError);
    expect(() => validateLayout("x", { ...body, drawings: [] })).toThrow(HttpError);
    expect(validateLayout("x", { ...body, paneRatios: { main: 1, abc: 0.3 } }).paneRatios).toEqual({ main: 1, abc: 0.3 });
    expect(() => validateLayout("x", { ...body, paneRatios: { main: -1 } })).toThrow(HttpError);
    expect(() => validateLayout("x", { ...body, paneRatios: [1] })).toThrow(HttpError);
    expect(validateLayout("x", { ...body, baseUpdatedAt: 5 })).not.toHaveProperty("baseUpdatedAt");
  });
});
