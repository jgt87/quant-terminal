// Starting content for layouts created by the workspace (new tab, new grid cell, duplicate).
// A cell whose layout id is not stored yet is created from its seed instead of the defaults.

import type { Layout } from "@qt/core";

const seeds = new Map<string, Partial<Layout>>();

export function seedLayout(id: string, seed: Partial<Layout>): void {
  seeds.set(id, { ...seed, id });
}

export function layoutSeed(id: string): Partial<Layout> | undefined {
  return seeds.get(id);
}

export function dropLayoutSeed(id: string): void {
  seeds.delete(id);
}
