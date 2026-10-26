// In-app toast store (stacked, newest on top). Framework free so any module can push.

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "info" | "alert" | "error";
  /** Shown as a hint; clicking the toast runs it. */
  onClick?: () => void;
  /** Auto-dismiss after ms (0 = sticky). */
  ttl: number;
}

type Listener = (list: Toast[]) => void;

const MAX = 6;
let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function pushToast(t: Omit<Toast, "id" | "ttl"> & { ttl?: number }): number {
  const toast: Toast = { ttl: 8000, ...t, id: ++seq };
  toasts = [toast, ...toasts].slice(0, MAX);
  emit();
  if (toast.ttl > 0) setTimeout(() => dismissToast(toast.id), toast.ttl);
  return toast.id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => listeners.delete(l);
}
