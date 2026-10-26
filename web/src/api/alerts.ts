// Alerts REST API and the live alert stream.

import type { Alert, AlertEvent } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export type AlertBody = Omit<Alert, "id" | "createdAt" | "lastFiredAt">;

export interface AlertStatus {
  running: boolean;
  lastTickAt: number | null;
  lastTickMs: number | null;
  /** Last evaluation error per alert id. */
  errors: Record<string, string>;
}

export interface AlertFired {
  alert: Alert;
  event: AlertEvent;
}

const one = (id: string) => `/api/alerts/${encodeURIComponent(id)}`;

export const listAlerts = () => requestJson<Alert[]>("/api/alerts");
export const createAlert = (a: AlertBody) => requestJson<Alert>("/api/alerts", jsonBody("POST", a));
export const updateAlert = (id: string, patch: Partial<AlertBody>) => requestJson<Alert>(one(id), jsonBody("PUT", patch));
export const deleteAlert = (id: string) => requestJson<{ ok: true }>(one(id), { method: "DELETE" });
export const alertStatus = () => requestJson<AlertStatus>("/api/alerts/status");

export function alertEvents(since?: number, limit?: number): Promise<AlertEvent[]> {
  const p = new URLSearchParams();
  if (since !== undefined) p.set("since", String(since));
  if (limit !== undefined) p.set("limit", String(limit));
  const q = p.toString();
  return requestJson<AlertEvent[]>(q ? "/api/alerts/events?" + q : "/api/alerts/events");
}

export const markEventsSeen = (sel: { ids?: string[]; before?: number; all?: boolean }) =>
  requestJson<{ updated: number }>("/api/alerts/events/seen", jsonBody("PUT", sel));

/** Subscribe to fired alerts (Server-Sent Events). Returns the cleanup. */
export function subscribeAlerts(onFired: (p: AlertFired) => void, onState?: (open: boolean) => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const es = new EventSource("/api/alerts/stream");
  es.addEventListener("alert", (e) => {
    try {
      onFired(JSON.parse((e as MessageEvent<string>).data) as AlertFired);
    } catch {
      /* malformed event */
    }
  });
  es.onopen = () => onState?.(true);
  es.onerror = () => onState?.(false);
  return () => es.close();
}
