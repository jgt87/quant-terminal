import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskCache } from "../src/cache";
import { barsTtl } from "../src/providers";
import { providerError } from "../src/errors";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("DiskCache", () => {
  it("persists to disk and reports freshness by TTL", async () => {
    let now = 1_000_000;
    const a = new DiskCache<number>(dir, 10, () => now);
    await a.set("yahoo:AAPL:1D:latest:5", 42, 60);
    const b = new DiskCache<number>(dir, 10, () => now + 30_000); // fresh instance → read from disk
    expect(await b.get("yahoo:AAPL:1D:latest:5")).toEqual({ value: 42, fresh: true });
    now += 61_000;
    expect(await a.get("yahoo:AAPL:1D:latest:5")).toEqual({ value: 42, fresh: false });
  });

  it("evicts the least recently used memory entries", async () => {
    const c = new DiskCache<number>(undefined, 2);
    await c.set("a", 1, 60);
    await c.set("b", 2, 60);
    await c.get("a");
    await c.set("c", 3, 60);
    expect(await c.get("b")).toBeUndefined();
    expect((await c.get("a"))?.value).toBe(1);
    expect((await c.get("c"))?.value).toBe(3);
  });

  it("coalesces concurrent identical fetches", async () => {
    const c = new DiskCache<number>(undefined);
    let calls = 0;
    const fetcher = () => new Promise<number>((r) => setTimeout(() => r(++calls), 20));
    const results = await Promise.all([1, 2, 3, 4].map(() => c.getOrFetch("k", () => 60, fetcher)));
    expect(results).toEqual([1, 1, 1, 1]);
    expect(calls).toBe(1);
    expect(await c.getOrFetch("k", () => 60, fetcher)).toBe(1); // cached
  });

  it("serves stale data when the upstream fails", async () => {
    let now = 0;
    const c = new DiskCache<string>(undefined, 10, () => now);
    await c.set("k", "old", 1);
    now = 5000;
    expect(await c.getOrFetch("k", () => 1, () => Promise.reject(providerError("down")))).toBe("old");
    await expect(c.getOrFetch("other", () => 1, () => Promise.reject(providerError("down")))).rejects.toThrow("down");
  });
});

describe("barsTtl", () => {
  const now = 2_000_000_000;
  it("uses short TTLs for the latest page and long ones for history", () => {
    expect(barsTtl("1D", undefined, now)).toBe(900);
    expect(barsTtl("1W", undefined, now)).toBe(900);
    expect(barsTtl("1m", undefined, now)).toBe(30);
    expect(barsTtl("4h", undefined, now)).toBe(30);
    expect(barsTtl("1D", now - 30 * 86400, now)).toBe(7 * 86400);
    expect(barsTtl("5m", now - 3600, now)).toBe(7 * 86400);
    expect(barsTtl("1D", now - 10, now)).toBe(900); // `to` inside the running bar → still "latest"
  });
});
