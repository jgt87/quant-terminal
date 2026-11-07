// Types for lib.mjs (used by the tests).
export interface Evidence {
  file: string;
  hits: number;
  line: number;
}
export interface Slot {
  code: Evidence[];
  docs: Evidence[];
}
export interface Scan {
  files: number;
  features: Record<string, Slot>;
  commit?: string;
}
export interface CatalogFeature {
  id: string;
  cat: string;
  name: string;
  patterns: string[];
  ref?: boolean;
  skip?: boolean;
}
export interface Catalog {
  categories: Record<string, string>;
  features: CatalogFeature[];
}
export interface Repo {
  id: string;
  listed: string;
  repo: string;
  license: string;
  reuse: "port" | "features" | string;
  kind?: string;
}
export type Status = "yes" | "weak" | "claimed" | "no" | "n/a";
export interface MatrixRow {
  id: string;
  cat: string;
  name: string;
  ref: boolean;
  skip: boolean;
  ours: Status;
  oursNote?: string;
  count: number;
  offeredBy: string[];
  status: Record<string, Status>;
}
export interface Matrix {
  features: MatrixRow[];
}
export type Compiled = (CatalogFeature & { re: RegExp })[];

export const SKIP_DIRS: Set<string>;
export const CODE_EXT: Set<string>;
export const DOC_EXT: Set<string>;
export const MAX_FILE_BYTES: number;
export const STATUS_ORDER: Status[];
export const GENERIC_WORDS: Set<string>;
export function compileCatalog(catalog: Catalog): Compiled;
export function listFiles(root: string, opts?: { include?: string[] | null; exclude?: string[] }): string[];
export function isDoc(rel: string): boolean;
export function wordify(text: string): string;
export function matchText(compiled: Compiled, rel: string, text: string): Record<string, { hits: number; line: number }>;
export function scanTree(root: string, compiled: Compiled, opts?: { include?: string[] | null; exclude?: string[] }): Scan;
export function featureStatus(slot: Partial<Slot> | undefined): Status;
export function offers(s: Status): boolean;
export function buildMatrix(catalog: Catalog, repos: Repo[], scans: Record<string, Scan>, ours: Scan, overrides?: Record<string, { status: Status; note?: string }>): Matrix;
export function gaps(matrix: Matrix): MatrixRow[];
export function extras(matrix: Matrix, min?: number): MatrixRow[];
export function commonGround(matrix: Matrix, repoCount: number, share?: number): MatrixRow[];
export function rankSourceFiles(files: Evidence[]): Evidence[];
export function extractSources(
  featureId: string,
  repos: Repo[],
  scans: Record<string, Scan>,
  limit?: number,
): { repo: string; name: string; url: string; license: string; reuse: string; status: Status; files: Evidence[] }[];
export function coverage(
  matrix: Matrix,
  repoCount: number,
  generated: string,
): { generated: string; projects: number; inScope: number; have: number; features: { id: string; ours: Status; offeredBy: number; ref?: false; skip?: true }[] };
export function ledgerOverrides(ledger: { features?: Record<string, { date?: string; files?: string[]; note?: string }> }): Record<string, { status: Status; note: string }>;
export function nameTerms(manifest: { repos?: { listed?: string; repo?: string }[]; terms?: string[] }): string[];
export function findNames(text: string, terms: string[]): { line: number; term: string }[];
export function renderReport(catalog: Catalog, repos: Repo[], matrix: Matrix, opts: { generated: string; scans: Record<string, Scan> }): string;
