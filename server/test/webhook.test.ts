import { afterEach, describe, expect, it } from "vitest";
import { checkWebhookTarget, checkWebhookUrlSyntax, isPrivateAddress, sendWebhook } from "../src/alerts/webhook";

const noSleep = async () => {};

afterEach(() => {
  delete process.env.QT_ALLOW_PRIVATE_WEBHOOKS;
});

describe("webhook target checks", () => {
  it("private address ranges", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.1.1", "100.64.0.1", "0.0.0.0", "127.0.0.1", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111", "100.128.0.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("syntax: http(s) only, no credentials, no literal private IPs; localhost allowed", () => {
    expect(checkWebhookUrlSyntax("https://example.com/hook")).toBeNull();
    expect(checkWebhookUrlSyntax("http://localhost:9999/x")).toBeNull();
    expect(checkWebhookUrlSyntax("http://127.0.0.1:9999/x")).toBeNull();
    expect(checkWebhookUrlSyntax("http://[::1]:9999/x")).toBeNull();
    expect(checkWebhookUrlSyntax("ftp://example.com")).toMatch(/http/);
    expect(checkWebhookUrlSyntax("not a url")).toMatch(/valid/);
    expect(checkWebhookUrlSyntax("https://u:p@example.com")).toMatch(/credentials/);
    expect(checkWebhookUrlSyntax("http://10.0.0.5/x")).toMatch(/private/);
    expect(checkWebhookUrlSyntax("http://[fd00::5]/x")).toMatch(/private/);
  });

  it("QT_ALLOW_PRIVATE_WEBHOOKS=1 lifts the private-network restriction", () => {
    process.env.QT_ALLOW_PRIVATE_WEBHOOKS = "1";
    expect(checkWebhookUrlSyntax("http://10.0.0.5/x")).toBeNull();
  });

  it("host names are resolved and refused when any address is private", async () => {
    expect(await checkWebhookTarget("https://example.com/x", async () => ["93.184.215.14"])).toBeNull();
    expect(await checkWebhookTarget("https://intranet.example/x", async () => ["93.184.215.14", "10.0.0.2"])).toMatch(/private/);
    expect(await checkWebhookTarget("https://bad.example/x", async () => { throw new Error("ENOTFOUND"); })).toMatch(/cannot resolve/);
  });
});

describe("sendWebhook", () => {
  const resolve = async () => ["93.184.215.14"];

  it("posts JSON once on success", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const r = await sendWebhook("https://example.com/hook", { a: 1 }, {
      resolve,
      sleep: noSleep,
      fetchFn: async (url, init) => {
        seen.push({ url, init: init! });
        return new Response("ok", { status: 200 });
      },
    });
    expect(r).toMatchObject({ ok: true, attempts: 1, status: 200 });
    expect(seen[0].init.method).toBe("POST");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ a: 1 });
    expect((seen[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(seen[0].init.redirect).toBe("manual");
  });

  it("retries 3 times with exponential backoff on 5xx and network errors", async () => {
    const delays: number[] = [];
    let n = 0;
    const r = await sendWebhook("https://example.com/hook", {}, {
      resolve,
      sleep: async (ms) => void delays.push(ms),
      fetchFn: async () => {
        n++;
        if (n === 1) throw new Error("ECONNRESET");
        return new Response("", { status: 503 });
      },
    });
    expect(r).toMatchObject({ ok: false, attempts: 4, status: 503 });
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it("succeeds on a later attempt", async () => {
    let n = 0;
    const r = await sendWebhook("https://example.com/hook", {}, { resolve, sleep: noSleep, fetchFn: async () => new Response("", { status: ++n < 3 ? 500 : 200 }) });
    expect(r).toMatchObject({ ok: true, attempts: 3 });
  });

  it("does not retry 4xx (except 429)", async () => {
    let n = 0;
    const r = await sendWebhook("https://example.com/hook", {}, { resolve, sleep: noSleep, fetchFn: async () => (n++, new Response("", { status: 404 })) });
    expect(r).toMatchObject({ ok: false, attempts: 1, status: 404 });
    let m = 0;
    await sendWebhook("https://example.com/hook", {}, { resolve, sleep: noSleep, fetchFn: async () => (m++, new Response("", { status: 429 })) });
    expect(m).toBe(4);
  });

  it("passes a timeout signal and never calls refused targets", async () => {
    let signal: AbortSignal | undefined | null;
    await sendWebhook("https://example.com/hook", {}, { resolve, sleep: noSleep, fetchFn: async (_u, init) => ((signal = init?.signal), new Response("", { status: 200 })) });
    expect(signal).toBeInstanceOf(AbortSignal);
    let called = false;
    const r = await sendWebhook("http://192.168.1.1/x", {}, { sleep: noSleep, fetchFn: async () => ((called = true), new Response("")) });
    expect(r).toMatchObject({ ok: false, attempts: 0 });
    expect(called).toBe(false);
  });
});
