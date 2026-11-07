// Types for tools/ensure-deps.mjs (used by server/test/launcher.test.ts).
export const REQUIRED_FILES: string[];
export function depsState(root: string): { state: "current" | "install" | "repair"; hash: string; missing?: string[] };
export function ensureDeps(root: string, log?: (message: string) => void): boolean;
