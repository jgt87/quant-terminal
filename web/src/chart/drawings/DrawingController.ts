// Generic drawing controller, driven by the tool registry: creation modes (click-per-anchor with
// rubber band, drag-to-create, freehand, poly), selection and multi-selection (Ctrl+click,
// Ctrl+drag rubber band), moving and handle drags, Alt+drag clone, arrow-key nudge, delete,
// copy/paste, undo/redo, lock/hide all, magnet modes and Shift-constrain. Works in main-pane
// pixel coordinates; drawings are stored in data space.

import { allAnchors, boundsOf, constrainPoint, magnetSnap, nudgeDrawing, rectFromPoints, rubberBandSelect, translateDrawing, type MagnetMode, type Point, type Rect } from "@qt/core";
import type { Anchor, Bar, Drawing, DrawingType } from "@qt/core";
import { Emitter } from "../Emitter";
import { copyDrawings, clipboardCount, pasteDrawings } from "./clipboard";
import { creationDoubleClick, creationDown, creationKey, creationMove, creationPreview, creationUp, IDLE, lastPlaced, type CreationResult, type CreationState } from "./creation";
import { History } from "./history";
import { getTool } from "./registry";
import { initialFor } from "./templateStore";
import type { DrawingToolDef, InlineTextEdit, Mods, ToolGeom } from "./types";

/** Active tool: a drawing type, the cursor, the eraser, or the zoom-to-range tool. */
export type Tool = DrawingType | "cursor" | "eraser" | "zoom";
export type CursorStyle = "cross" | "dot" | "arrow" | "demo";

export interface DrawingHost {
  toPx(a: Anchor): Point;
  toData(p: Point): Anchor;
  bars(): readonly Bar[];
  viewport(): { width: number; height: number };
  tolerance: number;
  /** Hidden drawings (or ones not shown on this interval) are not hit-testable. */
  isShown?(d: Drawing): boolean;
  /** Seconds per bar (stats, nudging fallback). */
  intervalSec?(): number;
  /** Moves a time by n bars (arrow-key nudge); default: n × interval seconds. */
  shiftTime?(t: number, n: number): number;
  /** Zoom-to-range tool: show the bars between two plot x positions. */
  zoomTo?(x0: number, x1: number): void;
}

export interface ControllerEvents extends Record<string, unknown> {
  /** Selected ids (primary last). */
  selection: string[];
  /** Undo/redo availability, lock/hide all, magnet, … changed. */
  state: null;
  /** Inline text editor requested by a tool's editText (double-click or creation). */
  inlineEdit: { id: string; edit: InlineTextEdit };
  /** Keyboard commands for the host: add alert (drawing or price), toggle hide all. */
  command: { kind: "alert"; drawingId?: string; price?: number } | { kind: "hideAll" };
}

type EditDrag =
  | { kind: "handle"; id: string; index: number; start: Point; before: Drawing[]; orig: Drawing; moved: boolean }
  | { kind: "move"; ids: string[]; start: Point; before: Drawing[]; orig: Map<string, Drawing>; moved: boolean; cloned: boolean; ctrlToggle?: string }
  | { kind: "band"; start: Point; additive: boolean; zoom: boolean };

let seq = 0;
export function newDrawingId(): string {
  seq = (seq + 1) % 1e6;
  return `d${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

const HISTORY_LIMIT = 100;

export class DrawingController {
  drawings: Drawing[] = [];
  tool: Tool = "cursor";
  magnet: MagnetMode = "off";
  cursorStyle: CursorStyle = "cross";
  /** Keep the drawing tool after a drawing is finished. */
  stayInDrawingMode = false;
  /** No drawing can be moved or edited. */
  lockAll = false;
  /** No drawing is drawn or hit-tested. */
  hideAll = false;
  selectedIds: string[] = [];
  hoverId: string | null = null;
  creation: CreationState = IDLE;
  /** Rubber band / zoom rectangle being dragged (pane px), for rendering. */
  band: Rect | null = null;
  /** Demonstration cursor: recent pointer positions (plot px, ms) for the fading trail. */
  trail: { x: number; y: number; t: number }[] = [];
  readonly events = new Emitter<ControllerEvents>();
  private drag: EditDrag | null = null;
  private history = new History<Drawing[]>(HISTORY_LIMIT);
  private histories = new Map<string, History<Drawing[]>>();
  private historyKey = "";

  constructor(
    private host: DrawingHost,
    private emit: {
      changed(drawings: Drawing[]): void;
      tool(tool: Tool): void;
      selection(id: string | null): void;
      textRequest(id: string, text: string): void;
      redraw(): void;
    },
  ) {}

  // ---------- state ----------

  /** Primary selected drawing (the last one selected). */
  get selectedId(): string | null {
    return this.selectedIds[this.selectedIds.length - 1] ?? null;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  /** Placement in progress, null when idle. */
  get placing(): CreationState | null {
    return this.creation.kind === "idle" ? null : this.creation;
  }

  get busy(): boolean {
    return this.creation.kind !== "idle" || this.drag !== null;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Drawings in render order (stable by zIndex, then list order). */
  ordered(): Drawing[] {
    if (!this.drawings.some((d) => d.zIndex !== undefined)) return this.drawings;
    return this.drawings
      .map((d, i) => ({ d, i }))
      .sort((a, b) => (a.d.zIndex ?? 0) - (b.d.zIndex ?? 0) || a.i - b.i)
      .map((x) => x.d);
  }

  geom(): ToolGeom {
    return {
      toPx: (a) => this.host.toPx(a),
      toData: (p) => this.host.toData(p),
      viewport: this.host.viewport(),
      bars: this.host.bars(),
      intervalSec: this.host.intervalSec?.() ?? 86400,
    };
  }

  private shown(d: Drawing): boolean {
    return !this.hideAll && !d.hidden && (!this.host.isShown || this.host.isShown(d));
  }

  isLocked(d: Drawing): boolean {
    return this.lockAll || Boolean(d.locked);
  }

  /**
   * Replace the list (symbol switch / layout load). `key` selects the undo history (one per
   * symbol); without a key the current history is kept.
   */
  setDrawings(list: Drawing[], key?: string): void {
    if (key !== undefined && key !== this.historyKey) {
      this.histories.set(this.historyKey, this.history);
      this.history = this.histories.get(key) ?? new History<Drawing[]>(HISTORY_LIMIT);
      this.historyKey = key;
    }
    this.drawings = list;
    this.retainSelection();
    this.creation = IDLE;
    this.drag = null;
    this.band = null;
    this.events.emit("state", null);
    this.emit.redraw();
  }

  /** Replace the list from outside (drawing sync from another chart): no history, no change event. */
  replaceAll(list: Drawing[]): void {
    if (this.drag) return;
    this.drawings = list;
    this.retainSelection();
    this.emit.redraw();
  }

  /** Patch merged into the next drawing created with the tool (tool pickers: icon, emoji). */
  private preset: Partial<Drawing> | null = null;

  setTool(tool: Tool, preset?: Partial<Drawing>): void {
    this.preset = preset ?? null;
    this.tool = tool;
    this.creation = IDLE;
    this.band = null;
    if (tool !== "cursor") this.select([]);
    this.emit.tool(tool);
    this.emit.redraw();
  }

  setMagnet(mode: MagnetMode | boolean): void {
    this.magnet = mode === true ? "strong" : mode === false ? "off" : mode;
    this.events.emit("state", null);
  }

  setFlags(f: { lockAll?: boolean; hideAll?: boolean; stayInDrawingMode?: boolean; cursorStyle?: CursorStyle }): void {
    if (f.lockAll !== undefined) this.lockAll = f.lockAll;
    if (f.hideAll !== undefined) {
      this.hideAll = f.hideAll;
      if (f.hideAll) this.select([]);
    }
    if (f.stayInDrawingMode !== undefined) this.stayInDrawingMode = f.stayInDrawingMode;
    if (f.cursorStyle !== undefined) this.cursorStyle = f.cursorStyle;
    this.events.emit("state", null);
    this.emit.redraw();
  }

  /** Drawing being placed, including its preview anchor, for rendering. */
  placingDrawing(): Drawing | null {
    const p = creationPreview(this.creation);
    if (!p || (p.anchors.length === 0 && !p.points?.length)) return null;
    const def = getTool(p.type);
    const init = def ? initialFor(def) : {};
    const d: Drawing = { id: "__placing", type: p.type, anchors: p.anchors };
    if (init.style) d.style = init.style;
    if (init.props) d.props = init.props;
    if (p.points) d.points = p.points;
    if (def?.defaultText !== undefined) d.text = def.defaultText;
    return d;
  }

  // ---------- commits and history ----------

  /** Sets the list as one undoable step (before = the current list). */
  private commit(next: Drawing[], before: Drawing[] = this.drawings, mergeKey?: string): void {
    this.history.record(before, mergeKey);
    this.drawings = next;
    this.retainSelection();
    this.emit.changed(this.drawings);
    this.events.emit("state", null);
    this.emit.redraw();
  }

  private restore(list: Drawing[] | null): boolean {
    if (!list) return false;
    this.drawings = list;
    this.retainSelection();
    this.emit.changed(this.drawings);
    this.events.emit("state", null);
    this.emit.redraw();
    return true;
  }

  undo(): boolean {
    return this.restore(this.history.undo(this.drawings));
  }

  redo(): boolean {
    return this.restore(this.history.redo(this.drawings));
  }

  /** Ends a merged edit run (settings window closed). */
  sealHistory(): void {
    this.history.seal();
  }

  // ---------- hit-testing ----------

  private snap(a: Anchor, def?: DrawingToolDef): Anchor {
    if (def?.snap === false) return a;
    return magnetSnap(a, this.host.bars(), (x) => this.host.toPx(x), this.magnet);
  }

  /** Pointer → anchor: Shift constrains against `from` (no magnet then), else the magnet applies. */
  private point(p: Point, mods: Mods, from: Anchor | null, def?: DrawingToolDef): Anchor {
    if (mods.shift && from) return this.host.toData(constrainPoint(this.host.toPx(from), p));
    return this.snap(this.host.toData(p), def);
  }

  hitTest(x: number, y: number): { id: string; anchorIndex: number | null } | null {
    const g = this.geom();
    const tol = this.host.tolerance;
    const order = [...this.ordered()].reverse();
    // Selected drawings win ties so their handles stay grabbable.
    order.sort((a, b) => Number(this.isSelected(b.id)) - Number(this.isSelected(a.id)));
    for (const d of order) {
      if (!this.shown(d)) continue;
      const def = getTool(d.type);
      if (!def) continue;
      let best: number | null = null;
      let bestDist = Infinity;
      def.handles(d, g).forEach((p, i) => {
        const dd = Math.hypot(p.x - x, p.y - y);
        if (dd <= tol && dd < bestDist) {
          best = i;
          bestDist = dd;
        }
      });
      if (best !== null) return { id: d.id, anchorIndex: best };
      if (def.hitTest(d, g, x, y, tol)) return { id: d.id, anchorIndex: null };
    }
    return null;
  }

  /** Selection box of a drawing in pane px. */
  bounds(d: Drawing): Rect {
    const def = getTool(d.type);
    const g = this.geom();
    if (def?.bounds) return def.bounds(d, g);
    return boundsOf(def ? def.handles(d, g) : allAnchors(d).map((a) => g.toPx(a)));
  }

  // ---------- pointer ----------

  /** Returns true when the event was consumed (no chart panning). */
  pointerDown(x: number, y: number, mods: Mods = {}): boolean {
    const p = { x, y };
    const def = this.toolDef();
    if (def) {
      const a = this.point(p, mods, lastPlaced(this.creation), def);
      this.applyCreation(creationDown(this.creation, def, a, p), def);
      this.emit.redraw();
      return true;
    }
    if (this.tool === "zoom") {
      this.drag = { kind: "band", start: p, additive: false, zoom: true };
      this.band = rectFromPoints(p, p);
      return true;
    }
    const hit = this.hitTest(x, y);
    if (this.tool === "eraser") {
      if (hit) this.remove(hit.id);
      return true;
    }
    if (!hit) {
      if (mods.ctrl) {
        this.drag = { kind: "band", start: p, additive: true, zoom: false };
        this.band = rectFromPoints(p, p);
        return true;
      }
      this.select([]);
      this.emit.redraw();
      return false;
    }
    if (mods.ctrl) {
      // Ctrl+click toggles the drawing in the selection (on release); Ctrl+drag clones.
      const ids = this.isSelected(hit.id) ? [...this.selectedIds] : [...this.selectedIds, hit.id];
      const orig = new Map(this.drawings.filter((k) => ids.includes(k.id)).map((k) => [k.id, k]));
      this.drag = { kind: "move", ids, start: p, before: this.drawings, orig, moved: false, cloned: false, ctrlToggle: hit.id };
      return true;
    }
    if (!this.isSelected(hit.id)) this.select([hit.id]);
    else if (this.selectedId !== hit.id) this.select([...this.selectedIds.filter((k) => k !== hit.id), hit.id]);
    const d = this.drawings.find((k) => k.id === hit.id)!;
    if (hit.anchorIndex !== null && !mods.alt && this.selectedIds.length === 1) {
      if (!this.isLocked(d)) this.drag = { kind: "handle", id: d.id, index: hit.anchorIndex, start: p, before: this.drawings, orig: d, moved: false };
    } else {
      const ids = this.selectedIds.filter((id) => {
        const k = this.drawings.find((x) => x.id === id);
        return k && (mods.alt ? !this.lockAll : !this.isLocked(k));
      });
      if (ids.length) {
        const orig = new Map(this.drawings.filter((k) => ids.includes(k.id)).map((k) => [k.id, k]));
        this.drag = { kind: "move", ids, start: p, before: this.drawings, orig, moved: false, cloned: false };
      }
    }
    this.emit.redraw();
    return true;
  }

  /** Returns a cursor hint for the hovered element. */
  pointerMove(x: number, y: number, mods: Mods = {}): string | null {
    const p = { x, y };
    const def = this.toolDef();
    if (def && this.creation.kind !== "idle") {
      const a = this.point(p, mods, lastPlaced(this.creation), def);
      this.applyCreation(creationMove(this.creation, a, p), def);
      this.emit.redraw();
      return "crosshair";
    }
    const g = this.drag;
    if (g?.kind === "band") {
      this.band = rectFromPoints(g.start, p);
      this.emit.redraw();
      return "crosshair";
    }
    if (g?.kind === "handle") {
      if (!g.moved && Math.hypot(x - g.start.x, y - g.start.y) < 2) return "grabbing";
      g.moved = true;
      const tool = getTool(g.orig.type);
      const pts = allAnchors(g.orig);
      const ref = pts.length > 1 ? pts[g.index === 0 ? 1 : g.index - 1] : null;
      const a = this.point(p, mods, ref, tool);
      const next = tool?.onAnchorDrag ? tool.onAnchorDrag(g.orig, g.index, a, this.geom(), mods) : replaceAnchor(g.orig, g.index, a);
      this.drawings = this.drawings.map((d) => (d.id === g.id ? next : d));
      this.emit.redraw();
      return "grabbing";
    }
    if (g?.kind === "move") {
      let dx = x - g.start.x;
      let dy = y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 2) return "grabbing";
      if (!g.moved && (mods.alt || g.ctrlToggle)) {
        if (this.lockAll) return "not-allowed";
        this.cloneForDrag(g);
      }
      g.moved = true;
      if (mods.shift) {
        // Shift moves along one axis only.
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const geo = this.geom();
      this.drawings = this.drawings.map((d) => {
        const o = g.orig.get(d.id);
        return o ? this.translate(o, dx, dy, geo) : d;
      });
      this.emit.redraw();
      return "grabbing";
    }
    if (this.tool === "zoom") return "zoom-in";
    if (def) return "crosshair";
    const hit = this.hitTest(x, y);
    const id = hit?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.emit.redraw();
    }
    if (this.tool === "eraser") return hit ? "pointer" : "crosshair";
    return hit ? (hit.anchorIndex !== null ? "move" : "pointer") : null;
  }

  pointerUp(x?: number, y?: number, mods: Mods = {}): void {
    const def = this.toolDef();
    if (def && this.creation.kind !== "idle") {
      if (x !== undefined && y !== undefined) {
        const p = { x, y };
        const a = this.point(p, mods, lastPlaced(this.creation), def);
        this.applyCreation(creationUp(this.creation, a, p), def);
        this.emit.redraw();
      }
      return;
    }
    const g = this.drag;
    this.drag = null;
    if (!g) return;
    if (g.kind === "band") {
      const band = x !== undefined && y !== undefined ? rectFromPoints(g.start, { x, y }) : this.band;
      this.band = null;
      if (band && g.zoom) {
        if (band.width > 4) this.host.zoomTo?.(band.x, band.x + band.width);
        if (!this.stayInDrawingMode) this.setTool("cursor");
      } else if (band) {
        const items = this.drawings.filter((d) => this.shown(d)).map((d) => ({ id: d.id, bounds: this.bounds(d) }));
        const ids = rubberBandSelect(band, items);
        this.select(g.additive ? [...new Set([...this.selectedIds, ...ids])] : ids);
      }
      this.emit.redraw();
      return;
    }
    if (g.kind === "move" && !g.moved && g.ctrlToggle) {
      const id = g.ctrlToggle;
      this.select(this.isSelected(id) ? this.selectedIds.filter((k) => k !== id) : [...this.selectedIds, id]);
      this.emit.redraw();
      return;
    }
    if (g.moved) this.commit(this.drawings, g.before);
  }

  pointerLeave(): void {
    if (this.creation.kind === "click" && this.creation.preview) {
      this.creation = { ...this.creation, preview: null };
      this.emit.redraw();
    }
    if (this.hoverId) {
      this.hoverId = null;
      this.emit.redraw();
    }
  }

  /** Double click: finishes a poly, else edits a text drawing. Returns true when consumed. */
  doubleClick(x: number, y: number): boolean {
    if (this.creation.kind === "poly") {
      const def = this.toolDef();
      if (def) this.applyCreation(creationDoubleClick(this.creation), def);
      this.emit.redraw();
      return true;
    }
    const hit = this.hitTest(x, y);
    if (!hit) return false;
    const d = this.drawings.find((k) => k.id === hit.id);
    const def = d && getTool(d.type);
    if (!d || !def || this.isLocked(d)) return false;
    if (def.editText) return this.requestInlineEdit(d, def, x, y);
    if (def.defaultText !== undefined) {
      this.emit.textRequest(d.id, d.text ?? "");
      return true;
    }
    return false;
  }

  private requestInlineEdit(d: Drawing, def: DrawingToolDef, x?: number, y?: number): boolean {
    const edit = def.editText?.(d, this.geom(), x, y);
    if (!edit) return false;
    this.events.emit("inlineEdit", { id: d.id, edit });
    return true;
  }

  /** Hotkeys that draw at the cursor (Alt+H, Alt+J, Alt+V, Alt+C): one-anchor tools only. */
  drawAt(type: string, x: number, y: number): boolean {
    const def = getTool(type);
    if (!def || def.anchors !== 1) return false;
    this.finish(def, { anchors: [this.point({ x, y }, {}, null, def)] }, true);
    return true;
  }

  private toolDef(): DrawingToolDef | undefined {
    if (this.tool === "cursor" || this.tool === "eraser" || this.tool === "zoom") return undefined;
    return getTool(this.tool);
  }

  private applyCreation(r: CreationResult, def: DrawingToolDef): void {
    this.creation = r.state;
    if (r.done) this.finish(def, r.done);
  }

  private finish(def: DrawingToolDef, geo: { anchors: Anchor[]; points?: Anchor[] }, keepTool = false): void {
    const init = initialFor(def);
    const d: Drawing = { id: newDrawingId(), type: def.type, anchors: geo.anchors };
    if (init.style) d.style = init.style;
    if (init.props) d.props = init.props;
    if (geo.points) d.points = geo.points;
    if (def.defaultText !== undefined) d.text = def.defaultText;
    if (this.preset) {
      const p = this.preset;
      Object.assign(d, { ...p, style: p.style ? { ...d.style, ...p.style } : d.style, props: p.props ? { ...d.props, ...p.props } : d.props });
    }
    const created = def.onCreate ? def.onCreate(d, this.geom()) : d;
    this.creation = IDLE;
    this.commit([...this.drawings, created]);
    this.select([created.id]);
    if (!this.stayInDrawingMode && !keepTool) this.setTool("cursor");
    if (def.editText) this.requestInlineEdit(created, def);
    else if (def.defaultText !== undefined) this.emit.textRequest(created.id, "");
  }

  private cloneForDrag(g: Extract<EditDrag, { kind: "move" }>): void {
    const clones: Drawing[] = [];
    const orig = new Map<string, Drawing>();
    for (const id of g.ids) {
      const d = g.orig.get(id);
      if (!d) continue;
      const c: Drawing = { ...structuredClone(d), id: newDrawingId() };
      delete c.locked;
      clones.push(c);
      orig.set(c.id, c);
    }
    this.drawings = [...this.drawings, ...clones];
    g.orig = orig;
    g.ids = clones.map((c) => c.id);
    g.cloned = true;
    this.select(g.ids);
  }

  /** Moves a drawing by px: the tool's onTranslate, else every anchor / point through the projection. */
  private translate(d: Drawing, dx: number, dy: number, g: ToolGeom): Drawing {
    const def = getTool(d.type);
    if (def?.onTranslate) return def.onTranslate(d, dx, dy, g);
    return translateDrawing(d, dx, dy, g.toPx, g.toData);
  }

  // ---------- keyboard ----------

  /** Handles drawing keys; returns true when consumed. */
  keyDown(e: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): boolean {
    const k = e.key;
    if (e.ctrl) {
      const lower = k.toLowerCase();
      if (lower === "z" && !e.shift) return this.undo() || true;
      if (lower === "y" || (lower === "z" && e.shift)) return this.redo() || true;
      if (lower === "c") return this.copySelection();
      if (lower === "v") return this.paste();
      return false;
    }
    if (k === "Enter" || k === "Escape") {
      const def = this.toolDef();
      const r = creationKey(this.creation, k);
      if (r && def) {
        this.applyCreation(r, def);
        this.emit.redraw();
        return true;
      }
      if (k === "Escape") return this.cancel();
      // Enter on one selected text drawing opens its inline editor.
      if (this.creation.kind === "idle" && this.tool === "cursor" && this.selectedIds.length === 1) {
        const d = this.drawings.find((x) => x.id === this.selectedIds[0]);
        const sel = d && getTool(d.type);
        if (d && sel?.editText && !this.isLocked(d)) return this.requestInlineEdit(d, sel);
      }
      return false;
    }
    if (k === "Delete" || k === "Backspace") return this.removeSelected();
    if (k.startsWith("Arrow") && this.selectedIds.length && this.creation.kind === "idle") return this.nudge(k, Boolean(e.shift));
    return false;
  }

  /** Arrow keys: left/right by bars, up/down by pixels (Shift: ×10). */
  private nudge(key: string, big: boolean): boolean {
    const n = big ? 10 : 1;
    const bars = key === "ArrowLeft" ? -n : key === "ArrowRight" ? n : 0;
    const dy = key === "ArrowUp" ? -n : key === "ArrowDown" ? n : 0;
    const ids = this.selectedIds.filter((id) => {
      const d = this.drawings.find((x) => x.id === id);
      return d && !this.isLocked(d);
    });
    if (!ids.length) return false;
    const sec = this.host.intervalSec?.() ?? 86400;
    const shiftTime = this.host.shiftTime ?? ((t: number, k: number) => t + k * sec);
    const shiftPrice = (time: number, price: number, d: number) => {
      const p = this.host.toPx({ time, price });
      return this.host.toData({ x: p.x, y: p.y + d }).price;
    };
    this.commit(
      this.drawings.map((d) => (ids.includes(d.id) ? nudgeDrawing(d, bars, dy, shiftTime, shiftPrice) : d)),
      this.drawings,
      `nudge:${ids.join(",")}`,
    );
    return true;
  }

  /** Esc: cancel a drag, then creation, then deselect, then return to the cursor tool. */
  cancel(): boolean {
    const g = this.drag;
    if (g) {
      this.drag = null;
      this.band = null;
      if (g.kind !== "band") {
        this.drawings = g.before;
        this.retainSelection();
      }
      this.emit.redraw();
      return true;
    }
    if (this.creation.kind !== "idle") {
      this.creation = IDLE;
      this.emit.redraw();
      return true;
    }
    if (this.selectedIds.length) {
      this.select([]);
      this.emit.redraw();
      return true;
    }
    if (this.tool !== "cursor") {
      this.setTool("cursor");
      return true;
    }
    return false;
  }

  // ---------- clipboard ----------

  copySelection(): boolean {
    const list = this.drawings.filter((d) => this.isSelected(d.id));
    if (!list.length) return false;
    copyDrawings(list);
    return true;
  }

  /** Pastes the clipboard at the same coordinates and selects the copies. */
  paste(): boolean {
    if (!clipboardCount()) return false;
    const copies = pasteDrawings(newDrawingId);
    this.commit([...this.drawings, ...copies]);
    this.select(copies.map((c) => c.id));
    return true;
  }

  // ---------- edits (menus, floating toolbar, settings, object tree) ----------

  removeSelected(): boolean {
    if (!this.selectedIds.length) return false;
    const ids = new Set(this.selectedIds);
    this.commit(this.drawings.filter((d) => !ids.has(d.id)));
    this.select([]);
    return true;
  }

  removeAll(): void {
    this.creation = IDLE;
    if (!this.drawings.length) return;
    this.commit([]);
    this.select([]);
  }

  /** Replace one drawing via `fn` (one undo step; equal mergeKeys merge into one step). */
  update(id: string, fn: (d: Drawing) => Drawing, mergeKey?: string): void {
    this.updateMany([id], fn, mergeKey);
  }

  /** Replace several drawings via `fn` as one undo step. */
  updateMany(ids: readonly string[], fn: (d: Drawing) => Drawing, mergeKey?: string): void {
    const set = new Set(ids);
    let changed = false;
    const next = this.drawings.map((d) => {
      if (!set.has(d.id)) return d;
      const n = fn(d);
      if (n !== d) changed = true;
      return n;
    });
    if (!changed) return;
    this.commit(next, this.drawings, mergeKey);
  }

  /** Copies of drawings, offset slightly so they are visible, selected. */
  clone(id: string | readonly string[]): void {
    const ids = typeof id === "string" ? [id] : id;
    const copies: Drawing[] = [];
    for (const k of ids) {
      const d = this.drawings.find((x) => x.id === k);
      if (!d) continue;
      const c = this.translate({ ...structuredClone(d), id: newDrawingId() }, 12, 12, this.geom());
      delete c.locked;
      copies.push(c);
    }
    if (!copies.length) return;
    this.commit([...this.drawings, ...copies]);
    this.select(copies.map((c) => c.id));
  }

  /** Add finished drawings (e.g. converted from a study) and select the last one. */
  add(list: Drawing[]): void {
    if (!list.length) return;
    this.commit([...this.drawings, ...list]);
    this.select([list[list.length - 1].id]);
  }

  /** Visual order: bring to front / forward one step / backward one step / send to back. */
  reorder(id: string | readonly string[], where: "front" | "back" | "forward" | "backward"): void {
    const ids = new Set(typeof id === "string" ? [id] : id);
    const moving = this.drawings.filter((d) => ids.has(d.id));
    if (!moving.length) return;
    let next: Drawing[];
    if (where === "front" || where === "back") {
      const rest = this.drawings.filter((d) => !ids.has(d.id));
      next = where === "front" ? [...rest, ...moving] : [...moving, ...rest];
    } else {
      next = [...this.drawings];
      const step = where === "forward" ? 1 : -1;
      const idx = [...next.keys()];
      for (const i of where === "forward" ? idx.reverse() : idx) {
        const j = i + step;
        if (!ids.has(next[i].id) || j < 0 || j >= next.length || ids.has(next[j].id)) continue;
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    // Explicit zIndex values would override the list order: drop them for the moved drawings.
    next = next.map((d) => {
      if (!ids.has(d.id) || d.zIndex === undefined) return d;
      const copy = { ...d };
      delete copy.zIndex;
      return copy;
    });
    this.commit(next);
  }

  remove(id: string | readonly string[]): void {
    const ids = new Set(typeof id === "string" ? [id] : id);
    if (!this.drawings.some((d) => ids.has(d.id))) return;
    this.commit(this.drawings.filter((d) => !ids.has(d.id)));
  }

  selectId(id: string | null): void {
    this.select(id && this.drawings.some((d) => d.id === id) ? [id] : []);
    this.emit.redraw();
  }

  /** Select several drawings (object tree, menus). */
  selectIds(ids: readonly string[]): void {
    this.select(ids.filter((id) => this.drawings.some((d) => d.id === id)));
    this.emit.redraw();
  }

  setText(id: string, text: string): void {
    this.update(id, (d) => ({ ...d, text }));
  }

  // ---------- selection ----------

  private retainSelection(): void {
    const keep = this.selectedIds.filter((id) => this.drawings.some((d) => d.id === id && !d.hidden));
    if (keep.length !== this.selectedIds.length) this.select(keep);
    if (this.hoverId && !this.drawings.some((d) => d.id === this.hoverId)) this.hoverId = null;
  }

  private select(ids: string[]): void {
    const same = ids.length === this.selectedIds.length && ids.every((id, i) => id === this.selectedIds[i]);
    if (same) return;
    const prevPrimary = this.selectedId;
    this.selectedIds = ids;
    if (this.selectedId !== prevPrimary) this.emit.selection(this.selectedId);
    this.events.emit("selection", ids);
  }
}

/** Default handle drag: anchors first, then path points. */
export function replaceAnchor(d: Drawing, index: number, a: Anchor): Drawing {
  if (index < d.anchors.length) return { ...d, anchors: d.anchors.map((x, i) => (i === index ? a : x)) };
  const k = index - d.anchors.length;
  if (!d.points || k >= d.points.length) return d;
  return { ...d, points: d.points.map((x, i) => (i === k ? a : x)) };
}
