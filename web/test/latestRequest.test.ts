import { describe, expect, it } from "vitest";
import { LatestRequest } from "../src/api/client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("latest request ownership", () => {
  it("rejects an old result even when the provider ignores cancellation", async () => {
    const requests = new LatestRequest();
    const old = deferred<string>();
    const stale = requests.run(() => old.promise);
    const rejected = expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(await requests.run(async () => "current")).toBe("current");
    old.resolve("old");
    await rejected;
  });

  it("suppresses an old provider error after replacement", async () => {
    const requests = new LatestRequest();
    const old = deferred<string>();
    const stale = requests.run(() => old.promise);
    const rejected = expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await requests.run(async () => "current");
    old.reject(new Error("old failure"));
    await rejected;
  });

  it("rejects late completion after explicit abort", async () => {
    const requests = new LatestRequest();
    const old = deferred<number>();
    const result = requests.run(() => old.promise);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    requests.abort();
    old.resolve(1);
    await rejected;
  });

  it("keeps ownership of the current request when an old one finishes", async () => {
    const requests = new LatestRequest();
    const old = deferred<number>();
    const current = deferred<number>();
    const first = requests.run(() => old.promise);
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = requests.run(() => current.promise);
    const secondRejected = expect(second).rejects.toMatchObject({ name: "AbortError" });
    old.resolve(1);
    await firstRejected;
    requests.abort();
    current.resolve(2);
    await secondRejected;
  });

  it("preserves the current provider error", async () => {
    const error = new Error("current failure");
    await expect(new LatestRequest().run(async () => { throw error; })).rejects.toBe(error);
  });
});
