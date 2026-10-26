import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FetchFn } from "../src/providers/types";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as T;
}

export interface FakeReply {
  status?: number;
  body: unknown;
}

/** A fetch stub: `handler` maps a URL to a reply; every requested URL is recorded. */
export function fakeFetch(handler: (url: URL) => FakeReply | undefined): FetchFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string) => {
    calls.push(input);
    const reply = handler(new URL(input));
    if (!reply) return new Response(JSON.stringify({ error: "no stub" }), { status: 500 });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as FetchFn & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** Synthetic Binance klines endpoint: `count` daily bars starting at `start` (seconds). */
export function binanceKlinesStub(start: number, count: number, step = 86400) {
  return (url: URL): FakeReply => {
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const endTime = url.searchParams.get("endTime");
    const endSec = endTime ? Math.floor(Number(endTime) / 1000) : Infinity;
    const rows: unknown[][] = [];
    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      if (t > endSec) break;
      const p = 100 + i;
      rows.push([t * 1000, String(p), String(p + 2), String(p - 2), String(p + 1), "10", t * 1000 + step * 1000 - 1]);
    }
    return { body: rows.slice(Math.max(0, rows.length - limit)) };
  };
}
