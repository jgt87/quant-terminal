// Tiny event bus so code outside the panel host (e.g. chart context menus) can open a panel
// or the alert dialog without holding a reference to it.

import type { PanelId } from "./registry";
import type { AlertDraft } from "./alerts/alertModel";

type Handler<T> = (v: T) => void;

function channel<T>() {
  const handlers = new Set<Handler<T>>();
  let pending: T[] = [];
  return {
    emit(v: T) {
      if (handlers.size === 0) pending.push(v);
      handlers.forEach((h) => h(v));
    },
    on(h: Handler<T>) {
      handlers.add(h);
      // Deliver requests made before the host mounted.
      const queued = pending;
      pending = [];
      queued.forEach(h);
      return () => {
        handlers.delete(h);
      };
    },
  };
}

export const openPanelRequests = channel<PanelId>();
export const alertDialogRequests = channel<AlertDraft>();
