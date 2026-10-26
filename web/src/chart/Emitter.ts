// Minimal typed event emitter.

export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(v: never) => void>>();

  on<K extends keyof E>(event: K, fn: (value: E[K]) => void): () => void {
    let set = this.map.get(event);
    if (!set) this.map.set(event, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => set!.delete(fn as (v: never) => void);
  }

  emit<K extends keyof E>(event: K, value: E[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of set) (fn as (v: E[K]) => void)(value);
  }

  clear(): void {
    this.map.clear();
  }
}
