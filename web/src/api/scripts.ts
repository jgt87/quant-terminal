// User scripts REST API (the list omits the source).

import type { UserScript } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export interface ScriptListItem {
  id: string;
  name: string;
  kind: UserScript["kind"];
  updatedAt: number;
  size: number;
}

export type ScriptBody = Pick<UserScript, "name" | "kind" | "source">;

const one = (id: string) => `/api/scripts/${encodeURIComponent(id)}`;

export const listScripts = () => requestJson<ScriptListItem[]>("/api/scripts");
export const getScript = (id: string) => requestJson<UserScript>(one(id));
export const createScript = (s: ScriptBody) => requestJson<UserScript>("/api/scripts", jsonBody("POST", s));
export const saveScript = (id: string, s: ScriptBody) => requestJson<UserScript>(one(id), jsonBody("PUT", { ...s, id }));
export const deleteScript = (id: string) => requestJson<{ ok: true }>(one(id), { method: "DELETE" });
