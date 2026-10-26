// Creation-mode state machine (pure, no DOM). The controller feeds it pointer/key events with
// anchors that are already magnet-snapped and Shift-constrained; it answers with the next state
// and, when the drawing is complete, its anchors / path points.
//
// Modes:
// - click-per-anchor: each click places an anchor; the preview follows the pointer (rubber band).
// - drag-to-create: press, drag, release places the first two anchors in one gesture (2+ anchors).
// - freehand: the pointer path while pressed, simplified with Ramer–Douglas–Peucker.
// - poly: click vertices; Enter or double-click finishes; Esc removes the last vertex, then cancels.

import { simplifyPath, type Anchor, type Point } from "@qt/core";

/** Minimum pointer travel (px) that turns a press into a drag. */
export const DRAG_THRESHOLD = 4;

export type CreationState =
  | { kind: "idle" }
  | {
      kind: "click";
      type: string;
      need: number;
      anchors: Anchor[];
      preview: Anchor | null;
      /** Pointer is down since the last placed anchor (a drag may be starting). */
      pressed: boolean;
      downAt: Point | null;
      dragging: boolean;
      dragCreate: boolean;
    }
  | { kind: "freehand"; type: string; points: Anchor[]; px: Point[] }
  | { kind: "poly"; type: string; points: Anchor[]; px: Point[]; preview: Anchor | null };

export interface CreationResult {
  state: CreationState;
  /** The finished geometry: anchors (click/drag tools) or path points (freehand/poly). */
  done?: { anchors: Anchor[]; points?: Anchor[] };
  /** Creation was cancelled (Esc with nothing left to remove). */
  cancelled?: boolean;
}

export interface CreationTool {
  type: string;
  anchors: number | "freehand" | "poly";
  dragCreate?: boolean;
}

export const IDLE: CreationState = { kind: "idle" };

const near = (a: Point, b: Point, r: number) => Math.hypot(a.x - b.x, a.y - b.y) < r;

export function creationDown(s: CreationState, tool: CreationTool, a: Anchor, p: Point): CreationResult {
  if (s.kind === "idle") {
    if (tool.anchors === "freehand") return { state: { kind: "freehand", type: tool.type, points: [a], px: [p] } };
    if (tool.anchors === "poly") return { state: { kind: "poly", type: tool.type, points: [a], px: [p], preview: null } };
    const need = Math.max(1, tool.anchors);
    if (need === 1) return { state: IDLE, done: { anchors: [a] } };
    return {
      state: { kind: "click", type: tool.type, need, anchors: [a], preview: null, pressed: true, downAt: p, dragging: false, dragCreate: tool.dragCreate !== false },
    };
  }
  if (s.kind === "click") {
    const anchors = [...s.anchors, a];
    if (anchors.length >= s.need) return { state: IDLE, done: { anchors } };
    return { state: { ...s, anchors, preview: null, pressed: true, downAt: p, dragging: false } };
  }
  if (s.kind === "poly") return { state: { ...s, points: [...s.points, a], px: [...s.px, p], preview: null } };
  return { state: s };
}

export function creationMove(s: CreationState, a: Anchor, p: Point): CreationResult {
  if (s.kind === "click") {
    const dragging = s.dragging || (s.pressed && s.dragCreate && s.downAt !== null && !near(p, s.downAt, DRAG_THRESHOLD));
    return { state: { ...s, preview: a, dragging } };
  }
  if (s.kind === "freehand") {
    const last = s.px[s.px.length - 1];
    if (last && near(p, last, 2)) return { state: s };
    return { state: { ...s, points: [...s.points, a], px: [...s.px, p] } };
  }
  if (s.kind === "poly") return { state: { ...s, preview: a } };
  return { state: s };
}

/** Pointer released. A drag places the anchor at the release point; a click waits for the next. */
export function creationUp(s: CreationState, a: Anchor, p: Point, epsilon = 1.5): CreationResult {
  if (s.kind === "click") {
    if (s.dragging) {
      const anchors = [...s.anchors, a];
      if (anchors.length >= s.need) return { state: IDLE, done: { anchors } };
      return { state: { ...s, anchors, preview: null, pressed: false, downAt: null, dragging: false } };
    }
    return { state: { ...s, pressed: false, downAt: null } };
  }
  if (s.kind === "freehand") {
    const pts = [...s.points, a];
    const px = [...s.px, p];
    const kept = simplifyPath(px.map((q, i) => ({ x: q.x, y: q.y, i })), epsilon);
    const points = kept.map((k) => pts[k.i]);
    if (points.length < 2) return { state: IDLE, cancelled: true };
    return { state: IDLE, done: { anchors: [], points } };
  }
  return { state: s };
}

/** Poly: drops consecutive vertices closer than 3 px (a double click places two). */
function dedupe(points: Anchor[], px: Point[]): Anchor[] {
  const out: Anchor[] = [];
  let last: Point | null = null;
  points.forEach((pt, i) => {
    if (last && near(px[i], last, 3)) return;
    out.push(pt);
    last = px[i];
  });
  return out;
}

function finishPoly(s: Extract<CreationState, { kind: "poly" }>): CreationResult {
  const points = dedupe(s.points, s.px);
  if (points.length < 2) return { state: IDLE, cancelled: true };
  return { state: IDLE, done: { anchors: [], points } };
}

export function creationDoubleClick(s: CreationState): CreationResult {
  if (s.kind === "poly") return finishPoly(s);
  return { state: s };
}

/** Enter finishes a poly; Escape removes the last poly vertex or cancels. Returns null when unhandled. */
export function creationKey(s: CreationState, key: "Enter" | "Escape"): CreationResult | null {
  if (s.kind === "idle") return null;
  if (key === "Enter") return s.kind === "poly" ? finishPoly(s) : null;
  if (s.kind === "poly" && s.points.length > 1) return { state: { ...s, points: s.points.slice(0, -1), px: s.px.slice(0, -1) } };
  return { state: IDLE, cancelled: true };
}

/** Geometry to preview while creating (anchors plus the rubber-band point), null when nothing. */
export function creationPreview(s: CreationState): { type: string; anchors: Anchor[]; points?: Anchor[] } | null {
  if (s.kind === "click") return { type: s.type, anchors: s.preview ? [...s.anchors, s.preview] : s.anchors };
  if (s.kind === "freehand") return { type: s.type, anchors: [], points: s.points };
  if (s.kind === "poly") return { type: s.type, anchors: [], points: s.preview ? [...s.points, s.preview] : s.points };
  return null;
}

/** Last placed point (Shift-constrain reference), null when nothing is placed. */
export function lastPlaced(s: CreationState): Anchor | null {
  if (s.kind === "click") return s.anchors[s.anchors.length - 1] ?? null;
  if (s.kind === "poly") return s.points[s.points.length - 1] ?? null;
  return null;
}
