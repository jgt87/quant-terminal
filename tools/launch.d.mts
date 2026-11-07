// Types for tools/launch.mjs (used by server/test/launcher.test.ts).
export type Fx = "yahoo" | "mt5" | "deriv";
export type Check = { status: "OK" | "WARN" | "FAIL" | "INFO"; name: string; detail: string };
export const ROOT: string;
export function parseArgs(argv: string[]): { fx: Fx; check: boolean; noUpdate: boolean; noBrowser: boolean; unknown: string[] };
export function nodeSupported(version: string, fx?: Fx): boolean;
export function nodeRequirement(fx?: Fx): string;
export function computerChecks(fx: Fx, opts?: { nodeVersion?: string; isGit?: boolean }): Promise<Check[]>;
export function formatChecks(checks: Check[]): string;
export function portBusy(port: number): Promise<boolean>;
export function probeTerminal(port: number): Promise<{ app: string; version: string } | null>;
export function readPidFile(dataDir: string): { pid: number; port: number; version: string } | null;
export function main(argv?: string[], env?: Record<string, string | undefined>): Promise<number>;
export function whatsNew(from: string, to: string, out?: { isTTY?: boolean; columns?: number }): string;
export function writeReplacedNote(dataDir: string, note: { by: string; at: number }): void;
export function replacedBy(dataDir: string, since: number, now?: number): string | null;
