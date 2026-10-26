// Web Worker entry for user scripts. Network and code-loading globals are removed before any
// script runs; the script itself is compiled with `new Function` inside this worker only.

import type { Bar } from "@qt/core";
import { evaluateScript } from "./sandbox";

const scope = self as unknown as Record<string, unknown> & { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
const post = scope.postMessage.bind(scope);

for (const name of ["fetch", "importScripts", "XMLHttpRequest", "WebSocket", "EventSource", "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker"]) {
  try {
    Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
  } catch {
    try {
      scope[name] = undefined;
    } catch {
      /* not configurable here */
    }
  }
}

scope.onmessage = (e: MessageEvent<{ source: string; bars: Bar[] }>) => {
  const { source, bars } = e.data;
  post(evaluateScript(source, bars));
};
