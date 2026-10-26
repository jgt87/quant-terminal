// Elliott wave labels: degree notation table, label text per wave point, label placement
// (above highs, below lows) and wave hit-testing. Pure, no DOM.

import { distanceToSegment, type Point } from "./geometry";

/** The 15 wave degrees, largest first (index = stored `props.degree`). */
export const ELLIOTT_DEGREES = [
  "Supermillennium",
  "Millennium",
  "Submillennium",
  "Grand supercycle",
  "Supercycle",
  "Cycle",
  "Primary",
  "Intermediate",
  "Minor",
  "Minute",
  "Minuette",
  "Subminuette",
  "Micro",
  "Submicro",
  "Minuscule",
] as const;

/** Default degree (Intermediate). */
export const ELLIOTT_DEFAULT_DEGREE = 7;

/** Numerals of impulse waves: upper roman, arabic or lower roman. */
export type ElliottNumerals = "romanUpper" | "arabic" | "romanLower";
/** Decoration around a label: [[x]], [x], ((x)), (x), circled, or plain. */
export type ElliottWrap = "dbracket" | "bracket" | "dparen" | "paren" | "circle" | "none";

export interface ElliottNotation {
  numerals: ElliottNumerals;
  /** Letters of corrective waves (A·B·C, W·X·Y) in upper or lower case. */
  upperLetters: boolean;
  wrap: ElliottWrap;
}

const N = (numerals: ElliottNumerals, upperLetters: boolean, wrap: ElliottWrap): ElliottNotation => ({ numerals, upperLetters, wrap });

/**
 * Our notation per degree. Groups of three step down through the decorations; the numerals
 * move from upper roman (largest) through arabic to lower roman / lower case (smallest):
 * Supermillennium [[I]] · Millennium [I] · Submillennium ⓘ-style circled I · Grand supercycle ((I)) ·
 * Supercycle (I) · Cycle I · Primary circled 1 · Intermediate (1) · Minor 1 · Minute circled i ·
 * Minuette (i) · Subminuette i · Micro circled 1 (lower letters) · Submicro ((1)) · Minuscule plain 1 (lower letters).
 */
export const ELLIOTT_NOTATION: readonly ElliottNotation[] = [
  N("romanUpper", true, "dbracket"),
  N("romanUpper", true, "bracket"),
  N("romanUpper", true, "circle"),
  N("romanUpper", true, "dparen"),
  N("romanUpper", true, "paren"),
  N("romanUpper", true, "none"),
  N("arabic", true, "circle"),
  N("arabic", true, "paren"),
  N("arabic", true, "none"),
  N("romanLower", false, "circle"),
  N("romanLower", false, "paren"),
  N("romanLower", false, "none"),
  N("arabic", false, "circle"),
  N("arabic", false, "dparen"),
  N("arabic", false, "none"),
];

/** Wave kinds and the names of their points after the origin. */
export type ElliottWaveKind = "impulse" | "correction" | "triangle" | "doubleCombo" | "tripleCombo";

export const ELLIOTT_POINTS: Record<ElliottWaveKind, readonly (number | string)[]> = {
  impulse: [1, 2, 3, 4, 5],
  correction: ["A", "B", "C"],
  triangle: ["A", "B", "C", "D", "E"],
  doubleCombo: ["W", "X", "Y"],
  tripleCombo: ["W", "X", "Y", "X", "Z"],
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function clampDegree(degree: unknown): number {
  const n = typeof degree === "number" && Number.isFinite(degree) ? Math.round(degree) : ELLIOTT_DEFAULT_DEGREE;
  return Math.min(ELLIOTT_DEGREES.length - 1, Math.max(0, n));
}

export interface ElliottLabel {
  /** Text including brackets / parentheses. */
  text: string;
  /** Draw a circle around the text. */
  circled: boolean;
}

/** Label of wave point `index` (1-based, after the origin) of a wave kind at a degree. */
export function labelFor(degree: number, kind: ElliottWaveKind, index: number): ElliottLabel {
  const n = ELLIOTT_NOTATION[clampDegree(degree)];
  const name = ELLIOTT_POINTS[kind][index - 1];
  if (name === undefined) return { text: "", circled: false };
  let core: string;
  if (typeof name === "number") {
    core = n.numerals === "arabic" ? String(name) : n.numerals === "romanUpper" ? ROMAN[name] : ROMAN[name].toLowerCase();
  } else core = n.upperLetters ? name : name.toLowerCase();
  const text =
    n.wrap === "dbracket" ? `[[${core}]]` : n.wrap === "bracket" ? `[${core}]` : n.wrap === "dparen" ? `((${core}))` : n.wrap === "paren" ? `(${core})` : core;
  return { text, circled: n.wrap === "circle" };
}

/** Labels of every point of a wave (origin excluded). */
export function elliottLabels(degree: number, kind: ElliottWaveKind): ElliottLabel[] {
  return ELLIOTT_POINTS[kind].map((_, i) => labelFor(degree, kind, i + 1));
}

/**
 * Side of each point's label: "above" for highs, "below" for lows. A point is a high when its
 * price is >= both neighbours (endpoints: >= their single neighbour); a lone point is "above".
 */
export function elliottLabelSides(prices: readonly number[]): ("above" | "below")[] {
  return prices.map((p, i) => {
    const prev = prices[i - 1];
    const next = prices[i + 1];
    if (prev === undefined && next === undefined) return "above";
    const highVsPrev = prev === undefined || p >= prev;
    const highVsNext = next === undefined || p >= next;
    if (highVsPrev && highVsNext) return "above";
    const lowVsPrev = prev === undefined || p <= prev;
    const lowVsNext = next === undefined || p <= next;
    if (lowVsPrev && lowVsNext) return "below";
    // In the middle of a leg: follow the direction from the previous point.
    return prev !== undefined && p > prev ? "above" : "below";
  });
}

/** Pixel center of a label of the given font size next to its wave point. */
export function elliottLabelPosition(p: Point, side: "above" | "below", fontSize: number, circled: boolean): Point {
  const gap = 4 + fontSize / 2 + (circled ? fontSize * 0.35 : 0);
  return { x: p.x, y: side === "above" ? p.y - gap : p.y + gap };
}

/** Distance from (x, y) to the polyline through pts. */
export function distanceToWave(pts: readonly Point[], x: number, y: number): number {
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return best;
}

/**
 * Wave hit: the polyline when the wave is shown, and each label's box (center ± half width/height).
 */
export function hitElliott(
  pts: readonly Point[],
  labels: readonly { center: Point; halfW: number; halfH: number }[],
  showWave: boolean,
  x: number,
  y: number,
  tol: number,
): boolean {
  if (showWave && pts.length > 1 && distanceToWave(pts, x, y) <= tol) return true;
  return labels.some((l) => Math.abs(x - l.center.x) <= l.halfW + tol && Math.abs(y - l.center.y) <= l.halfH + tol);
}
