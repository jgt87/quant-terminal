// Types for tools/changelog.mjs (used by server/test/launcher.test.ts).
export type Section = { version: string; date: string; items: string[] };
export function parseChangelog(text: string): Section[];
export function sectionsBetween(sections: Section[], from: string, to: string): Section[];
export function summarize(entry: string, max?: number): string;
export function wrap(text: string, width: number): string[];
export function renderWhatsNew(
  sections: Section[],
  opts?: { from?: string; to?: string; width?: number; color?: boolean; maxVersions?: number; maxItems?: number },
): string;
