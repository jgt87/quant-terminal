import { createHash } from "node:crypto";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./fsutil";

interface Entry<T> {
  key: string;
  storedAt: number; // ms
  ttl: number; // seconds
  value: T;
}

export interface CacheHit<T> {
  value: T;
  fresh: boolean;
}

/**
 * Two-level JSON cache: an in-memory LRU for hot entries in front of one JSON file per key on
 * disk. Expired entries are still returned (fresh=false) so callers can fall back to stale data
 * when the upstream fails.
 */
export class DiskCache<T> {
  private mem = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    /** Directory for cache files; undefined keeps the cache in memory only. */
    private readonly dir: string | undefined,
    private readonly maxMem = 300,
    private readonly now: () => number = Date.now,
  ) {}

  fileFor(key: string): string | undefined {
    if (!this.dir) return undefined;
    const prefix = key.split(":")[0].replace(/[^a-z0-9]/gi, "") || "x";
    return path.join(this.dir, `${prefix}-${createHash("sha1").update(key).digest("hex")}.json`);
  }

  async get(key: string): Promise<CacheHit<T> | undefined> {
    let entry = this.mem.get(key);
    if (entry) {
      this.mem.delete(key); // refresh LRU position
      this.mem.set(key, entry);
    } else {
      const file = this.fileFor(key);
      if (!file) return undefined;
      entry = await readJson<Entry<T>>(file).catch(() => undefined);
      if (!entry || entry.key !== key) return undefined;
      this.remember(entry);
    }
    return { value: entry.value, fresh: this.now() - entry.storedAt < entry.ttl * 1000 };
  }

  async set(key: string, value: T, ttlSec: number): Promise<void> {
    const entry: Entry<T> = { key, storedAt: this.now(), ttl: ttlSec, value };
    this.remember(entry);
    const file = this.fileFor(key);
    if (file) await writeJsonAtomic(file, entry).catch((err) => console.warn("[cache] write failed:", (err as Error).message));
  }

  private remember(entry: Entry<T>) {
    this.mem.delete(entry.key);
    this.mem.set(entry.key, entry);
    while (this.mem.size > this.maxMem) this.mem.delete(this.mem.keys().next().value!);
  }

  /** Run `fn` once per key at a time; concurrent callers share the same promise. */
  coalesce(key: string, fn: () => Promise<T>): Promise<T> {
    let p = this.inflight.get(key);
    if (!p) {
      p = fn().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  /**
   * Fresh cached value, else fetch (coalesced) and store. When the fetch fails with an error
   * accepted by `serveStaleOn`, a stale cached value is returned instead.
   */
  async getOrFetch(key: string, ttlSec: (value: T) => number, fetcher: () => Promise<T>, serveStaleOn: (err: unknown) => boolean = () => true): Promise<T> {
    const hit = await this.get(key);
    if (hit?.fresh) return hit.value;
    try {
      return await this.coalesce(key, async () => {
        const value = await fetcher();
        await this.set(key, value, ttlSec(value));
        return value;
      });
    } catch (err) {
      if (hit && serveStaleOn(err)) return hit.value;
      throw err;
    }
  }
}
