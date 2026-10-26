// Small JSON request helper for the panel APIs (same error contract as client.ts).

import { ApiError } from "./client";

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `HTTP ${res.status}`, body);
  }
  return body as T;
}

export const jsonBody = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
