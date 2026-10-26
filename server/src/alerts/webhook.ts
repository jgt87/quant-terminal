import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FetchFn } from "../providers/types";

const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain"]);

function ipv4Parts(ip: string): number[] | null {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

/** True for loopback addresses (allowed: they mean "this machine"). */
export function isLoopback(ip: string): boolean {
  const v4 = ipv4Parts(ip.replace(/^::ffff:/i, ""));
  if (v4) return v4[0] === 127;
  return ip === "::1";
}

/**
 * True for addresses that are not on the public internet: RFC 1918, link-local, CGNAT,
 * unspecified, multicast/reserved, unique-local and IPv4-mapped forms of those. Loopback
 * counts as private here; callers allow it separately.
 */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.replace(/^::ffff:/i, "");
  const v4 = ipv4Parts(mapped);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && v4[2] === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s);
}

const allowPrivate = () => process.env.QT_ALLOW_PRIVATE_WEBHOOKS === "1";

const hostOf = (u: URL) => u.hostname.replace(/^\[|\]$/g, "").toLowerCase();

/** Synchronous checks: URL syntax, http(s), and literal private IPs. Returns an error message or null. */
export function checkWebhookUrlSyntax(raw: string): string | null {
  if (raw.length > 2000) return "URL is too long";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a valid URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "must use http or https";
  if (u.username || u.password) return "credentials in the URL are not allowed";
  const host = hostOf(u);
  if (!host) return "missing host";
  if (LOCAL_NAMES.has(host) || allowPrivate()) return null;
  if (isIP(host) && !isLoopback(host) && isPrivateAddress(host)) return "private network targets are not allowed (set QT_ALLOW_PRIVATE_WEBHOOKS=1)";
  return null;
}

export type Resolver = (host: string) => Promise<string[]>;
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** Full check before sending: syntax plus every resolved address of a host name. */
export async function checkWebhookTarget(raw: string, resolve: Resolver = dnsResolve): Promise<string | null> {
  const err = checkWebhookUrlSyntax(raw);
  if (err) return err;
  const host = hostOf(new URL(raw));
  if (LOCAL_NAMES.has(host) || allowPrivate() || isIP(host)) return null;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch (e) {
    return `cannot resolve ${host}: ${(e as Error).message}`;
  }
  if (addrs.some((a) => !isLoopback(a) && isPrivateAddress(a))) return `${host} resolves to a private network address`;
  return null;
}

export interface WebhookOptions {
  fetchFn?: FetchFn;
  resolve?: Resolver;
  timeoutMs?: number;
  retries?: number;
  /** Delay before retry n (1-based), ms. */
  backoff?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface WebhookResult {
  ok: boolean;
  attempts: number;
  status?: number;
  error?: string;
}

/**
 * POST `payload` as JSON. 5 s timeout per attempt, 3 retries with exponential backoff
 * (1 s, 2 s, 4 s) on network errors, 429 and 5xx. Redirects are not followed.
 */
export async function sendWebhook(url: string, payload: unknown, opts: WebhookOptions = {}): Promise<WebhookResult> {
  const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const retries = opts.retries ?? 3;
  const backoff = opts.backoff ?? ((n) => 1000 * 2 ** (n - 1));
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const bad = await checkWebhookTarget(url, opts.resolve);
  if (bad) return { ok: false, attempts: 0, error: bad };
  const body = JSON.stringify(payload);
  let last: WebhookResult = { ok: false, attempts: 0 };
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (attempt > 1) await sleep(backoff(attempt - 1));
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "QuantTerminal-Alerts/1.0" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      await res.arrayBuffer().catch(() => undefined);
      last = { ok: res.status >= 200 && res.status < 300, attempts: attempt, status: res.status };
      if (last.ok) return last;
      if (res.status !== 429 && res.status < 500) return { ...last, error: `HTTP ${res.status}` };
      last.error = `HTTP ${res.status}`;
    } catch (err) {
      last = { ok: false, attempts: attempt, error: (err as Error).message };
    }
  }
  return last;
}
