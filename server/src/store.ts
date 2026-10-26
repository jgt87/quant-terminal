import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Layout, Watchlist } from "@qt/core";
import { badRequest } from "./errors";
import { readJson, writeJsonAtomic } from "./fsutil";

export const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const DOC_RE = /^[a-z][a-z0-9-]{0,63}\.json$/;

/** Random id that satisfies ID_RE. */
export const newId = () => randomUUID();

export const DEFAULT_WATCHLISTS: Watchlist[] = [
  {
    id: "main",
    name: "Main",
    symbols: ["^NDX", "^GSPC", "AAPL", "MSFT", "NVDA", "BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "EURUSD=X"],
  },
];

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export function assertId(id: string): string {
  if (typeof id !== "string" || !ID_RE.test(id)) throw badRequest("Invalid id (allowed: letters, digits, _ and -, max 64)");
  return id;
}

/** JSON document store under one directory; all writes are atomic (temp file + rename). */
export class Store {
  private readonly layoutsDir: string;
  /** Per-file write queue so concurrent PUTs land in order. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dir: string) {
    this.layoutsDir = path.join(dir, "layouts");
  }

  private serial<T>(file: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(file) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.queues.set(file, next);
    next.finally(() => { if (this.queues.get(file) === next) this.queues.delete(file); }).catch(() => {});
    return next;
  }

  /** Resolve a layout file, refusing anything that would leave the layouts directory. */
  layoutFile(id: string): string {
    assertId(id);
    const file = path.resolve(this.layoutsDir, `${id}.json`);
    if (path.dirname(file) !== path.resolve(this.layoutsDir)) throw badRequest("Invalid id");
    return file;
  }

  async getWatchlists(): Promise<Watchlist[]> {
    const file = path.join(this.dir, "watchlists.json");
    const lists = await readJson<Watchlist[]>(file);
    if (lists) return lists;
    await this.putWatchlists(DEFAULT_WATCHLISTS);
    return structuredClone(DEFAULT_WATCHLISTS);
  }

  putWatchlists(lists: Watchlist[]): Promise<void> {
    const file = path.join(this.dir, "watchlists.json");
    return this.serial(file, () => writeJsonAtomic(file, lists));
  }

  async listLayouts(): Promise<LayoutSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.layoutsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const out: LayoutSummary[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      if (!ID_RE.test(id)) continue;
      const layout = await readJson<Layout>(path.join(this.layoutsDir, name)).catch(() => undefined);
      if (layout) out.push({ id, name: layout.name ?? id, updatedAt: layout.updatedAt ?? 0 });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getLayout(id: string): Promise<Layout | undefined> {
    return readJson<Layout>(this.layoutFile(id));
  }

  putLayout(layout: Layout): Promise<void> {
    const file = this.layoutFile(layout.id);
    return this.serial(file, () => writeJsonAtomic(file, layout));
  }

  /**
   * Compare-and-write for layouts. When `baseUpdatedAt` is given and the stored layout is newer,
   * nothing is written and the stored layout is returned as the conflict. The stored updatedAt
   * always moves forward so two quick writes never share a stamp.
   */
  saveLayout(layout: Layout, baseUpdatedAt?: number): Promise<{ ok: true; layout: Layout } | { ok: false; current: Layout }> {
    const file = this.layoutFile(layout.id);
    return this.serial(file, async () => {
      const current = await readJson<Layout>(file).catch(() => undefined);
      if (current && baseUpdatedAt !== undefined && (current.updatedAt ?? 0) > baseUpdatedAt) return { ok: false as const, current };
      const stamped = { ...layout, updatedAt: Math.max(layout.updatedAt, (current?.updatedAt ?? 0) + 1) };
      await writeJsonAtomic(file, stamped);
      return { ok: true as const, layout: stamped };
    });
  }

  // ---------- Generic JSON documents (alerts, portfolios, paper accounts, workspace, ...) ----------

  /** Resolve a top-level document file (`alerts.json`, ...); names are fixed by the server code. */
  docFile(name: string): string {
    if (!DOC_RE.test(name)) throw new Error(`Invalid document name: ${name}`);
    return path.join(this.dir, name);
  }

  readDoc<T>(name: string): Promise<T | undefined> {
    return readJson<T>(this.docFile(name));
  }

  /**
   * Read-modify-write a document under its write queue. `fn` gets the current value (undefined
   * when missing) and returns the new value to write (or undefined to leave the file untouched)
   * plus a result for the caller.
   */
  updateDoc<T, R>(name: string, fn: (current: T | undefined) => { value?: T; result: R } | Promise<{ value?: T; result: R }>): Promise<R> {
    const file = this.docFile(name);
    return this.serial(file, async () => {
      const current = await readJson<T>(file);
      const out = await fn(current);
      if (out.value !== undefined) await writeJsonAtomic(file, out.value);
      return out.result;
    });
  }

  /** Resolve `<dir>/<id>.json` inside a collection directory, refusing path escapes. */
  itemFile(collection: string, id: string): string {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(collection)) throw new Error(`Invalid collection: ${collection}`);
    assertId(id);
    const dir = path.resolve(this.dir, collection);
    const file = path.resolve(dir, `${id}.json`);
    if (path.dirname(file) !== dir) throw badRequest("Invalid id");
    return file;
  }

  async listItems<T>(collection: string): Promise<T[]> {
    const dir = path.dirname(this.itemFile(collection, "x"));
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const out: T[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") || !ID_RE.test(name.slice(0, -5))) continue;
      const item = await readJson<T>(path.join(dir, name)).catch(() => undefined);
      if (item) out.push(item);
    }
    return out;
  }

  getItem<T>(collection: string, id: string): Promise<T | undefined> {
    return readJson<T>(this.itemFile(collection, id));
  }

  putItem<T>(collection: string, id: string, value: T): Promise<void> {
    const file = this.itemFile(collection, id);
    return this.serial(file, () => writeJsonAtomic(file, value));
  }

  deleteItem(collection: string, id: string): Promise<boolean> {
    const file = this.itemFile(collection, id);
    return this.serial(file, async () => {
      try {
        await unlink(file);
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw err;
      }
    });
  }

  /** Returns false when the layout did not exist. */
  deleteLayout(id: string): Promise<boolean> {
    const file = this.layoutFile(id);
    return this.serial(file, async () => {
      try {
        await unlink(file);
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw err;
      }
    });
  }
}
