// Contracts of the drawing-tool registry. One module per tool (tools/<family>/<tool>.ts) exports a
// DrawingToolDef; the controller, renderer, settings window, floating toolbar, menus, toolbar
// flyouts and object tree are generic and read everything from these definitions.

import type { Anchor, Bar, Drawing, DrawingStyle, FibLevel, Rect, VolumeProfile } from "@qt/core";
import type { Point } from "@qt/core";
import type { ReactNode } from "react";
import type { MenuItem } from "../../components/menuTypes";
import type { PaneRenderCtx } from "../renderers/types";
import type { ChartTheme } from "../theme";

/** Toolbar families, in toolbar order (see families.json). */
export type FamilyId =
  | "lines"
  | "channels"
  | "pitchforks"
  | "gann"
  | "fibonacci"
  | "patterns"
  | "elliott"
  | "cycles"
  | "projection"
  | "brushes"
  | "arrows"
  | "shapes"
  | "text"
  | "icons"
  /** Tools reached from the toolbar's bottom controls (measure), not from a family flyout. */
  | "measure";

/** Pointer modifiers passed through the controller. */
export interface Mods {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** Chart projection and context available to hit-testing, handles and anchor drags. */
export interface ToolGeom {
  /** Data → main-pane pixels. */
  toPx(a: Anchor): Point;
  /** Main-pane pixels → data (time snaps to the nearest bar slot). */
  toData(p: Point): Anchor;
  /** Plot width and main-pane height in px. */
  viewport: { width: number; height: number };
  bars: readonly Bar[];
  /** Seconds per bar of the chart. */
  intervalSec: number;
}

/** Render context: the pane canvas (already translated to the pane top) plus the projection. */
export interface DrawCtx extends PaneRenderCtx, ToolGeom {
  /** Resolved line color of the drawing (style.color or the theme's drawing color). */
  color: string;
  selected: boolean;
  hovered: boolean;
  formatPrice(p: number): string;
  priceDecimals: number;
  /** Volume profile of the bars a profile drawing covers (profile tools only). */
  profile?(d: Drawing): { profile: VolumeProfile; x0: number; x1: number } | null;
}

/** Path of a value inside a Drawing: `style.<key>`, `props.<key>`, or a top-level field. */
export type FieldKey = `style.${string}` | `props.${string}` | "text" | "locked" | "name";

interface FieldBase {
  key: FieldKey;
  label: string;
  /**
   * Fallback when the drawing has no value (a function gets the chart theme and the drawing).
   * This is what old drawings render with; factory values for new drawings go in the tool's
   * `defaults` / `defaultProps`.
   */
  default?: unknown | ((theme: ChartTheme, d: Drawing) => unknown);
  /** Show the field only when this returns true (e.g. fill color only when fill is on). */
  showIf?(d: Drawing): boolean;
  /** Catalog key this field implements (docs/reference/drawing-tools-catalog.json), for conformance. */
  catalog?: string;
  /** false: the field does not change the rendering (conformance wiring test skips it, listed). */
  visual?: boolean;
  /** Wiring test: state the field needs to show an effect (e.g. stats position needs a stat on). */
  testWith?(d: Drawing): Drawing;
  /** Wiring test: the changed value to try (default: derived from the field kind). */
  testValue?: unknown;
  /**
   * Derived fields: read / write the value instead of the `key` path (e.g. a stop distance in
   * ticks ↔ the stop anchor's price). `key` stays the field's id (and its storage when no set).
   */
  get?(d: Drawing): unknown;
  set?(d: Drawing, v: unknown): Drawing;
}

export type SettingsField =
  | (FieldBase & { kind: "color"; alpha?: boolean; /** Offer "Reset" that removes the value (e.g. "Use one color"). */ clearable?: boolean })
  | (FieldBase & { kind: "opacity" })
  | (FieldBase & { kind: "width" })
  | (FieldBase & { kind: "lineStyle" })
  | (FieldBase & { kind: "checkbox" })
  | (FieldBase & { kind: "number"; min?: number; max?: number; step?: number })
  | (FieldBase & { kind: "select"; options: { value: string | number | boolean; label: string }[] })
  | (FieldBase & { kind: "text"; multiline?: boolean; maxLength?: number })
  | (FieldBase & { kind: "fontSize"; sizes?: number[] })
  /**
   * Level table: rows of enabled · value · color (· width · style), add/remove rows. `catalogLevels`
   * maps catalog keys `<prefix><n>.<part>` onto the rows (part: visible, coeff, color, lineWidth,
   * lineStyle).
   */
  | (FieldBase & {
      kind: "levels";
      valueLabel?: string;
      /** Rows also carry width and line style (channel / pitchfork levels). */
      lineColumns?: boolean;
      /** Rows also carry a text (e.g. extension level labels). */
      textColumn?: boolean;
      defaults(theme: ChartTheme): LevelRow[];
      catalogLevels?: { prefix: string };
    })
  | { kind: "section"; label: string; key?: undefined; showIf?(d: Drawing): boolean; catalog?: undefined; visual?: undefined };

/** Inline text editor request of a tool (see DrawingToolDef.editText). */
export interface InlineTextEdit {
  /** Field path the text is stored in (e.g. "text", "props.cells_2_1"). */
  key: FieldKey;
  /** Editor box in main-pane px. */
  rect: Rect;
  value: string;
  multiline?: boolean;
  /** Custom storage (e.g. a table cell); default: setField(d, key, text). */
  apply?(d: Drawing, text: string): Drawing;
  /** Text style for the editor (px font size, color). */
  fontSize?: number;
  color?: string;
}

/** A field that holds a value (every kind except section headers). */
export type ValueField = Exclude<SettingsField, { kind: "section" }>;

/** One row of a level table: enabled (`visible`), value (`ratio`), color, optional width/style. */
export type LevelRow = FibLevel;

/** Tabs of the settings window. Empty/missing tabs are not shown. */
export interface SettingsSchema {
  style: SettingsField[];
  /** "Inputs": tool-specific values (position sizes, regression source, periods, …). */
  inputs?: SettingsField[];
  /** "Text": text, color, size, bold/italic, background… */
  text?: SettingsField[];
  /** Coordinates tab: date-time + price per anchor (default), price only, time only, or none. */
  coordinates?: "time-price" | "price" | "time" | false;
  /** Visibility-on-intervals tab (default true). */
  visibility?: boolean;
  /** Further tool-specific tabs (shown before Coordinates unless `tabOrder` says otherwise). */
  tabs?: { id: string; label: string; fields: SettingsField[] }[];
  /**
   * Tab order by id ("inputs", "style", "text", "coordinates", "visibility", or a custom tab id).
   * Default: inputs, style, text, custom tabs, coordinates, visibility. Unlisted tabs are hidden.
   */
  tabOrder?: string[];
}

/** What a tool's menu hooks may do. */
export interface MenuExtrasCtx {
  update(fn: (d: Drawing) => Drawing): void;
  /** Chart projection at menu time (e.g. Anchor: pin the drawing at its current screen place). */
  geom?: ToolGeom;
}

/**
 * Context of a tool's own right-click menu. `generic()` returns the default drawing menu
 * (state/drawingMenu.ts; item ids "alert", "template", "order", "visibility", "objectTree",
 * "clone", "copy", "lock", "hide", "remove", "settings") which the tool may filter, reorder or
 * extend; `GenericMenuOptions` do the common cases.
 */
export interface DrawingMenuCtx extends MenuExtrasCtx {
  generic(opts?: GenericMenuOptions): MenuItem[];
}

export interface GenericMenuOptions {
  /** Item ids to leave out. */
  omit?: string[];
  /** Items inserted after the item with the given id (missing id: appended before "remove"). */
  insertAfter?: { id: string; items: MenuItem[] }[];
}

/**
 * Floating-toolbar buttons (catalog ids). The bar always renders them in this master order:
 * templates · insert-column · insert-row · line-tool-color · background-color · text-color ·
 * font-size · line-tool-width / highlighter-width · style · settings · add-alert · lock ·
 * toggle-anchor · remove · more.
 */
export type FloatButton =
  | "templates"
  | "insert-column"
  | "insert-row"
  | "line-tool-color"
  | "background-color"
  /** A second background color button (two-color tools, e.g. Sector); needs a floatBinding. */
  | "background-color-2"
  | "text-color"
  | "font-size"
  | "line-tool-width"
  | "highlighter-width"
  | "style"
  | "settings"
  | "add-alert"
  | "lock"
  | "toggle-anchor"
  | "remove"
  | "more";

/** How a floating-toolbar button reads/writes the drawing (default: the field keys below). */
export interface FloatBinding {
  get(d: Drawing, theme: ChartTheme): unknown;
  /** `g`: chart projection when the toolbar has one (e.g. anchoring at the current screen place). */
  set(d: Drawing, v: unknown, g?: ToolGeom): Drawing;
}

export interface DrawingToolDef {
  /** Unique type stored in Drawing.type (never renamed once released). */
  type: string;
  family: FamilyId;
  label: string;
  /** Name inside "Add alert on {menuName}…" (default: label with a lower-case first letter). */
  menuName?: string;
  /** Catalog type this tool implements (e.g. "LineToolTrendLine"), for the conformance harness. */
  catalogType?: string;
  /** Flyout section inside the family's toolbar group (default: the family label). */
  section?: string;
  /** Icon name in the shared icon set (components/icons28.tsx), or the tool's own `iconPath`. */
  icon: string;
  /**
   * The tool's own icon: SVG path data on a 28×28 grid, 1px strokes on half-pixel coordinates,
   * stroked with currentColor (see docs/DRAWING-TOOLS.md §6 "Icons"). Wins over `icon`.
   */
  iconPath?: string;
  /** Optional filled parts of the icon (28×28 path data, filled with currentColor): anchor dots, arrow heads. */
  iconFill?: string;
  /** Number of anchors, or a pointer path ("freehand"), or click-to-add vertices ("poly"). */
  anchors: number | "freehand" | "poly";
  /** Display + binding, e.g. "Alt+T" or "Alt+Shift+R". */
  hotkey?: string;
  /** What the hotkey does: pick the tool (default) or draw it at the cursor right away (1 anchor). */
  hotkeyAction?: "select" | "draw-at-cursor";
  /** Factory style new drawings start with (overlaid by the user's default template). */
  defaults: DrawingStyle;
  /** Factory tool-specific props new drawings start with. */
  defaultProps?: Record<string, unknown>;
  /** Text tools: initial text; creation and double-click open the text prompt. */
  defaultText?: string;
  settings: SettingsSchema;
  /** "Add alert on this drawing": a line (crossing) or a band (entering/exiting). */
  alert?: "line" | "band";
  /** Floating-toolbar buttons (any order; rendered in the master order). Default: from the schema. */
  floatingToolbar?: FloatButton[];
  /** Overrides of what a floating-toolbar button edits (default: style.color, style.fillColor, …). */
  floatBindings?: Partial<Record<FloatButton, FieldKey | FloatBinding>>;
  /** Press–drag–release creates the drawing (default true for tools with 2+ anchors). */
  dragCreate?: boolean;
  /** Magnet applies to this tool's anchors (default true). */
  snap?: boolean;
  /** Called once when a drawing is created (e.g. capture the bars it copies). Return the drawing to store. */
  onCreate?(d: Drawing, g: ToolGeom): Drawing;
  /**
   * Body drag / clone offset by (dx, dy) px from the original `d` (default: every anchor and point
   * moves through the projection). Screen-anchored drawings move their screen place instead.
   */
  onTranslate?(d: Drawing, dx: number, dy: number, g: ToolGeom): Drawing;
  /**
   * Inline text editing (double-click, and right after creation for text tools): where the editor
   * goes and what it edits. `x, y` = the double-click point (pick a table cell). `apply` stores the
   * new text (default: the field `key`).
   */
  editText?(d: Drawing, g: ToolGeom, x?: number, y?: number): InlineTextEdit | null;
  /** false: not listed in the toolbar flyouts (tools outside the reference toolbar). */
  toolbar?: false;
  /**
   * A chooser shown before placing (Icon / Emoji / Sticker): render it; call `pick(patch)` to place
   * the tool with that patch merged into the new drawing, or `cancel()`.
   */
  picker?(pick: (patch: Partial<Drawing>) => void, cancel: () => void): ReactNode;
  /** Body hit (handles are tested by the controller first). */
  hitTest(d: Drawing, g: ToolGeom, x: number, y: number, tol: number): boolean;
  /** Draw the body. Stroke/fill color, width, dash and opacity are already set on the context. */
  render(c: DrawCtx, d: Drawing): void;
  /** Handle positions in px; index i is passed to onAnchorDrag. */
  handles(d: Drawing, g: ToolGeom): Point[];
  /** Handle i was dragged to `a` (default: replaces anchors[i], or points[i - anchors.length]). */
  onAnchorDrag?(d: Drawing, index: number, a: Anchor, g: ToolGeom, mods: Mods): Drawing;
  /** Selection box for rubber-band selection (default: bounds of the handles). */
  bounds?(d: Drawing, g: ToolGeom): Rect;
  /** Readout lines (stats box, object tree tooltip). */
  stats?(d: Drawing, g: ToolGeom): string[];
  /** Tool items in their own section between Copy and Lock (pitchfork variants, Anchor, Degree ▸, …). */
  menuSection?(d: Drawing, ctx: MenuExtrasCtx): MenuItem[];
  /** Tool items at the top of the menu, followed by a separator (Table: add column / row). */
  menuTop?(d: Drawing, ctx: MenuExtrasCtx): MenuItem[];
  /**
   * The whole right-click menu (single selection), built on `ctx.generic()`. Only for tools whose
   * menu differs beyond menuTop / menuSection.
   */
  contextMenu?(d: Drawing, ctx: DrawingMenuCtx): MenuItem[];
}
