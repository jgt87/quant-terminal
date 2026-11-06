// Types for tools/update.mjs (used by server/test/updater.test.ts).
export type UpdateResult = {
  status: "updated" | "current" | "skipped" | "available";
  message: string;
  from?: string;
  to?: string;
};
export const UPDATED: 10;
export function compareVersions(a: string, b: string): number;
export function updateGitCheckout(root: string, opts?: { branch?: string; remote?: string }): UpdateResult;
export function checkLatestRelease(root: string, opts?: { timeoutMs?: number }): Promise<UpdateResult>;
