// Pointer, wheel and keyboard handling for the chart engine.

import type { ChartEngine } from "./ChartEngine";
import { comboOfEvent, hotkeyMap } from "./drawings/registry";
import { dragSeparator, separatorAt } from "./Pane";

type Region =
  | { kind: "plot"; pane: number }
  | { kind: "priceAxis"; pane: number }
  | { kind: "timeAxis" }
  | { kind: "separator"; index: number }
  | { kind: "none" };

type DragMode =
  | { kind: "pan"; pane: number; lastX: number; lastY: number }
  | { kind: "priceScale"; pane: number; lastY: number }
  | { kind: "timeScale"; lastX: number }
  | { kind: "separator"; index: number; lastY: number }
  | { kind: "drawing" };

const HOTKEYS = hotkeyMap();
const mods = (ev: MouseEvent | KeyboardEvent) => ({ shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey });

export class ChartInteraction {
  private drag: DragMode | null = null;
  private pointerId: number | null = null;

  constructor(private e: ChartEngine) {
    const el = e.root;
    el.tabIndex = 0;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("dblclick", this.onDblClick);
    el.addEventListener("keydown", this.onKey);
    el.addEventListener("contextmenu", this.onContext);
  }

  destroy(): void {
    const el = this.e.root;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    el.removeEventListener("dblclick", this.onDblClick);
    el.removeEventListener("keydown", this.onKey);
    el.removeEventListener("contextmenu", this.onContext);
  }

  /** Pointer position in plot coordinates (x = 0 at the plot's left edge). */
  private pos(ev: MouseEvent): { x: number; y: number } {
    const r = this.e.root.getBoundingClientRect();
    return { x: ev.clientX - r.left - this.e.plotLeft, y: ev.clientY - r.top };
  }

  private region(x: number, y: number): Region {
    const e = this.e;
    const inPlotX = x >= 0 && x <= e.plotWidth;
    if (y > e.plotHeight) return inPlotX ? { kind: "timeAxis" } : { kind: "none" };
    const sep = separatorAt(e.panes, y, e.theme.separatorHeight);
    if (sep >= 0) return { kind: "separator", index: sep };
    const pane = e.panes.findIndex((p) => p.contains(y));
    if (pane < 0) return { kind: "none" };
    return inPlotX ? { kind: "plot", pane } : { kind: "priceAxis", pane };
  }

  private setCursor(c: string): void {
    if (this.e.root.style.cursor !== c) this.e.root.style.cursor = c;
  }

  private onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const e = this.e;
    e.focus();
    const { x, y } = this.pos(ev);
    const r = this.region(x, y);
    // Bar Replay: the click picks the start bar.
    if (e.replay.phase === "select" && r.kind === "plot" && e.data.length > 0) {
      e.replayDispatch({ type: "start", time: e.sourceTimeAtX(x), times: e.replayTimes() });
      return;
    }
    if (r.kind === "plot" && r.pane === 0 && e.data.length > 0 && e.drawings.pointerDown(x, y - e.mainPane.top, mods(ev))) {
      this.drag = { kind: "drawing" };
    } else if (r.kind === "plot") {
      this.drag = { kind: "pan", pane: r.pane, lastX: x, lastY: y };
      this.setCursor("grabbing");
    } else if (r.kind === "priceAxis") {
      this.drag = { kind: "priceScale", pane: r.pane, lastY: y };
    } else if (r.kind === "timeAxis") {
      this.drag = { kind: "timeScale", lastX: x };
    } else if (r.kind === "separator") {
      this.drag = { kind: "separator", index: r.index, lastY: y };
    }
    if (this.drag) {
      this.pointerId = ev.pointerId;
      e.root.setPointerCapture(ev.pointerId);
    }
  };

  private onMove = (ev: PointerEvent): void => {
    const e = this.e;
    const { x, y } = this.pos(ev);
    e.hover = { x, y };
    const d = this.drag;
    if (d) {
      switch (d.kind) {
        case "drawing":
          this.setCursor(e.drawings.pointerMove(x, y - e.mainPane.top, mods(ev)) ?? "crosshair");
          break;
        case "pan": {
          e.ts.pan(x - d.lastX);
          const ps = e.panes[d.pane]?.ps;
          if (ps && !ps.auto) ps.panBy(y - d.lastY);
          d.lastX = x;
          d.lastY = y;
          break;
        }
        case "priceScale": {
          const ps = e.panes[d.pane]?.ps;
          ps?.scaleBy(y - d.lastY);
          d.lastY = y;
          break;
        }
        case "timeScale":
          e.ts.zoom(Math.exp((x - d.lastX) * 0.008), e.plotWidth);
          d.lastX = x;
          break;
        case "separator":
          dragSeparator(e.panes, d.index, y - d.lastY);
          d.lastY = y;
          e.invalidateLayout();
          return;
      }
      if (d.kind === "pan" || d.kind === "timeScale") e.userViewChanged();
      else e.invalidate();
      return;
    }
    if (e.drawings.cursorStyle === "demo") e.drawings.trail.push({ x, y, t: performance.now() });
    // Hover feedback.
    const r = this.region(x, y);
    this.hoverEvent(x, y);
    const prevSep = e.hoverSeparator;
    e.hoverSeparator = r.kind === "separator" ? r.index : -1;
    let cursor = "default";
    if (r.kind === "plot") {
      const hint = r.pane === 0 ? e.drawings.pointerMove(x, y - e.mainPane.top, mods(ev)) : null;
      cursor = hint ?? plotCursor(e.drawings.cursorStyle);
    } else if (r.kind === "priceAxis") cursor = "ns-resize";
    else if (r.kind === "timeAxis") cursor = "ew-resize";
    else if (r.kind === "separator") cursor = "row-resize";
    this.setCursor(cursor);
    e.invalidate(prevSep !== e.hoverSeparator);
  };

  private onUp = (ev: PointerEvent): void => {
    if (this.drag?.kind === "drawing") {
      const p = this.pos(ev);
      this.e.drawings.pointerUp(p.x, p.y - this.e.mainPane.top, mods(ev));
    }
    if (this.drag?.kind === "separator") {
      this.e.events.emit("layout", this.e.paneInfos());
      this.e.commitPaneRatios();
    }
    this.drag = null;
    if (this.pointerId !== null && this.e.root.hasPointerCapture(this.pointerId)) {
      this.e.root.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    const { x, y } = this.pos(ev);
    this.setCursor(this.region(x, y).kind === "plot" ? plotCursor(this.e.drawings.cursorStyle) : "default");
  };

  /** Corporate event badge under the pointer (tooltip), reported only when it changes. */
  private hoverEvent(x: number, y: number): void {
    const e = this.e;
    const hit = e.eventHits.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r + 2) ?? null;
    if (hit?.marker === this.eventTip) return;
    this.eventTip = hit?.marker ?? null;
    e.events.emit("eventHover", hit ? { marker: hit.marker, x: hit.x + e.plotLeft, y: hit.y } : null);
  }

  private eventTip: unknown = null;

  private onLeave = (): void => {
    if (this.eventTip) {
      this.eventTip = null;
      this.e.events.emit("eventHover", null);
    }
    if (this.drag) return;
    this.e.hover = null;
    this.e.hoverSeparator = -1;
    this.e.drawings.pointerLeave();
    this.e.invalidate(false);
  };

  private onWheel = (ev: WheelEvent): void => {
    const e = this.e;
    if (e.data.length === 0) return;
    ev.preventDefault();
    const { x, y } = this.pos(ev);
    const r = this.region(x, y);
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
    const dy = ev.deltaY * unit;
    const dx = ev.deltaX * unit;
    if (r.kind === "priceAxis") {
      e.panes[r.pane]?.ps.scaleBy(dy * 0.3);
    } else if (Math.abs(dx) > Math.abs(dy) || ev.shiftKey) {
      e.ts.pan(-(Math.abs(dx) > Math.abs(dy) ? dx : dy));
    } else {
      e.ts.zoom(Math.exp(-dy * (ev.ctrlKey ? 0.01 : 0.0015)), Math.min(x, e.plotWidth));
    }
    if (r.kind === "priceAxis") e.invalidate();
    else e.userViewChanged();
  };

  private onDblClick = (ev: MouseEvent): void => {
    const e = this.e;
    const { x, y } = this.pos(ev);
    const r = this.region(x, y);
    if (r.kind === "priceAxis") e.panes[r.pane]?.ps.resetAuto();
    else if (r.kind === "timeAxis") {
      e.ts.reset();
      e.userViewChanged();
    }
    else if (r.kind === "plot" && r.pane === 0) e.drawings.doubleClick(x, y - e.mainPane.top);
    e.invalidate();
  };

  private onContext = (ev: MouseEvent): void => {
    // Never the browser menu: right click cancels a placement in progress, otherwise the app
    // opens its own menu for whatever the engine hit-test finds under the pointer.
    ev.preventDefault();
    const e = this.e;
    if (e.drawings.placing) {
      // Right click finishes a poly drawing (Enter), otherwise cancels the placement.
      if (!e.drawings.keyDown({ key: "Enter" })) e.drawings.cancel();
      return;
    }
    const { x, y } = this.pos(ev);
    const target = e.contextTarget(x, y);
    if (!target) return;
    // A right click inside a multi-selection keeps it (the menu then acts on all of them).
    if (target.kind === "drawing" && !e.drawings.isSelected(target.id)) e.selectDrawing(target.id);
    e.events.emit("contextMenu", { clientX: ev.clientX, clientY: ev.clientY, target });
  };

  private onKey = (ev: KeyboardEvent): void => {
    const e = this.e;
    const key = ev.key;
    // Tool hotkeys (Alt+T, Alt+Shift+R pick a tool; Alt+H/J/V/C draw at the cursor), Alt+A adds an
    // alert (selected drawing, else the cursor price), Ctrl+Alt+H hides all drawings. Other Alt
    // combinations belong to the workspace.
    if (ev.altKey) {
      const combo = comboOfEvent(ev);
      const hk = HOTKEYS[combo];
      if (hk) {
        ev.preventDefault();
        if (hk.action === "draw-at-cursor" && e.hover && e.data.length > 0) e.drawings.drawAt(hk.type, e.hover.x, e.hover.y - e.mainPane.top);
        else e.setTool(hk.type);
        return;
      }
      if (combo === "alt+a") {
        ev.preventDefault();
        const id = e.drawings.selectedId;
        const price = e.hover ? e.mainPane.ps.fromY(e.hover.y - e.mainPane.top) : null;
        e.drawings.events.emit("command", id ? { kind: "alert", drawingId: id } : { kind: "alert", price: price ?? undefined });
        return;
      }
      if (combo === "ctrl+alt+h") {
        ev.preventDefault();
        e.drawings.events.emit("command", { kind: "hideAll" });
        return;
      }
      if (!ev.ctrlKey && !ev.metaKey) return;
    }
    // Drawing keys: Ctrl+Z/Y/C/V, Delete, Esc, Enter (poly), arrows nudge the selection.
    if (key !== " " && !(e.replay.phase !== "off" && key === "ArrowRight" && ev.shiftKey && !e.drawings.selectedIds.length)) {
      if (e.drawings.keyDown({ key, ...mods(ev) })) {
        ev.preventDefault();
        e.invalidate();
        return;
      }
    }
    if (ev.ctrlKey || ev.metaKey) return;
    // Bar Replay keys: Space plays/pauses, Shift+Right steps, Escape cancels picking the start.
    if (e.replay.phase === "on" && (key === " " || (key === "ArrowRight" && ev.shiftKey))) {
      ev.preventDefault();
      e.replayDispatch(key === " " ? { type: "toggle", times: e.replayTimes() } : { type: "step", times: e.replayTimes() });
      return;
    }
    if (e.replay.phase === "select" && key === "Escape") {
      ev.preventDefault();
      e.replayDispatch({ type: "exit" });
      return;
    }
    let handled = true;
    const step = ev.shiftKey ? Math.max(1, Math.round(e.ts.visibleBarCount() * 0.25)) : 1;
    switch (key) {
      case "ArrowLeft":
        e.ts.scrollBars(-step);
        break;
      case "ArrowRight":
        e.ts.scrollBars(step);
        break;
      case "+":
      case "=":
        e.ts.zoom(1.2, e.ts.indexToX(e.ts.lastIndex));
        break;
      case "-":
      case "_":
        e.ts.zoom(1 / 1.2, e.ts.indexToX(e.ts.lastIndex));
        break;
      default:
        handled = false;
        if (key.length === 1 && /[a-z0-9^]/i.test(key)) {
          e.events.emit("typeToSearch", key);
          handled = true;
        }
    }
    if (handled) {
      ev.preventDefault();
      if (/^(ArrowLeft|ArrowRight|\+|=|-|_)$/.test(key)) e.userViewChanged();
      else e.invalidate();
    }
  };
}

/** CSS cursor over the plot for the cursor tool's style (cross / dot / arrow). */
function plotCursor(style: string): string {
  if (style === "arrow") return "default";
  if (style === "dot") return "none";
  return "crosshair";
}
