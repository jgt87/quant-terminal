# Drawing tools — parity specification

Target: the drawing-tool set, settings and menus of a professional web charting terminal, rebuilt from
publicly known behavior (tool names, anchors, user-visible options). No third-party code.
Anchors are data-space `{time, price}` (time may lie in the future area). "n" = number of anchors.

## 1. Architecture (required before adding tools)

- **Registry:** one module per tool in `web/src/chart/drawings/tools/<family>/<tool>.ts`, exporting a
  `DrawingToolDef`:
  `{ type, family, label, icon, anchors: n | "freehand" | "poly", hotkey?, defaults: DrawingStyle,
     settings: SettingsSchema (Style/Text/Coordinates/Visibility fields), hitTest, render, handles,
     onAnchorDrag?, snap?, stats?(…) , menuExtras?(…) }`.
  The controller, renderer, settings window, floating toolbar and menus are generic and driven by the
  registry. Core keeps pure geometry in `core/src/drawings/` (tests).
- **Types:** `DrawingType` becomes an open string union generated from the registry; `Drawing` gains
  optional `points?` (freehand/poly), `props?: Record<string, unknown>` (tool-specific settings),
  `groupId?`, `zIndex?`, `templateName?`. Old layouts load unchanged.
- **Creation modes:** click-per-anchor (with live rubber-band preview), drag-to-create (press–drag–release
  for 2-anchor tools), freehand (brush/highlighter: pointer path, simplified with Ramer–Douglas–Peucker),
  poly (path/polyline: click points, double-click or Enter to finish, Esc cancels last point).
  Shift constrains to horizontal/vertical/45°. Magnet: off / weak (snap when within 10 px) / strong
  (always snap to O/H/L/C of the nearest bar).
- **Editing:** select (click), multi-select (Ctrl+click, rubber-band with Ctrl+drag), move, drag handles,
  Alt+drag clones, arrow keys nudge (1 px; Shift = 10 px), Delete removes, Ctrl+C / Ctrl+V copy-paste
  (paste at same coordinates, or on another chart/symbol), Ctrl+Z / Ctrl+Y undo/redo (per layout, 100 steps,
  covers create/move/edit/delete/style changes).
- **Visibility:** per-drawing interval visibility (seconds/minutes/hours/days/weeks/months with ranges),
  hide/show, lock (no move/edit), "hide all drawings", "lock all drawings", "stay in drawing mode",
  "sync drawings to all charts of the same symbol" (link-group aware).
- **Templates:** per tool: "Save as…", "Apply default", list of saved templates; "Reset settings".
  Stored server-side (`/api/drawing-templates`), default template per tool used for new drawings.
- **Object tree panel** (right panel rail): all drawings/indicators of the active chart, grouped by pane,
  user groups (create group, drag into group, rename), per item: show/hide, lock, select-on-click,
  rename, delete; group-level show/hide/lock/delete; filter box.

## 2. Menus

- **Drawing context menu (right-click on a drawing):**
  Settings… · Add alert on this drawing (lines/channels/shapes) · Clone (Ctrl+drag) · Copy (Ctrl+C) ·
  Visual order ▸ (Bring to front, Bring forward, Send backward, Send to back) · Template ▸ (Save as…,
  Apply default, saved templates…, Reset) · Visibility on intervals ▸ (current interval and above / below /
  only current / all) · Lock / Unlock · Hide · Group ▸ (Add to new group, Add to <group>, Remove from group) ·
  Remove (Del). Multi-selection menu: Clone, Copy, Group, Lock, Hide, Remove (n objects).
- **Floating toolbar (over a selected drawing):** drag handle · template ▸ · line color · fill color (shapes) ·
  text color (text tools) · line width ▸ · line style ▸ (solid/dashed/dotted) · font size (text tools) ·
  settings · add alert · lock · remove · more ▸ (the context menu items). Remembers its position per session.
- **Left drawing toolbar:** cursor group (cross, dot, arrow, demonstration/eraser), then one button per
  family with a flyout listing the family's tools (last used tool becomes the button face); star toggles
  in flyouts add tools to a **favorites bar** (floating, draggable, persisted). Bottom: measure, zoom-in
  (zoom to a dragged range), magnet ▸ (weak/strong), stay in drawing mode, lock all, hide all ▸ (drawings /
  indicators / positions), remove ▸ (drawings / indicators / all), object tree.
- **Chart background menu** additions: Paste (when clipboard holds drawings), Remove drawings, Hide all drawings,
  Lock all drawings.

## 3. Settings windows (tabs per tool)

- **Style:** line color + opacity, width 1–4, style solid/dashed/dotted, extend left / extend right (lines,
  channels, fib levels), middle point / price labels / stats (lines), arrow heads start/end (arrow, trend),
  background fill + opacity (shapes, channels, fib, positions, ranges), per-level rows for fib/gann/pitchfork
  (checkbox, coefficient, color, add level), "use one color", labels position (left/right/top/bottom, inside),
  show prices / levels / percents (fib), reverse (fib), label font size.
- **Text:** text (multi-line), color, font size 10–40, bold, italic, alignment, background + border (callout,
  note, label tools), word wrap width.
- **Coordinates:** each anchor: date/time (bar) + price inputs; for 1-anchor price tools price only.
- **Visibility:** interval groups with min/max ranges.
- **Tool-specific inputs:** position tools (account size, risk %, lot size, entry/stop/target editable as price
  or ticks, quantity precision, show compact stats), regression trend (source, upper/lower deviation, use
  upper/lower, Pearson's R), anchored VWAP (source, bands), price/date range (show stats), info line
  (stats: price change, %, bars, time, angle, distance), trend angle (angle readout), Elliott (degree,
  label style), cycle tools (period), sine line (period/amplitude from anchors).

## 4. Tool catalog (parity list)

| Family | Tools (n anchors) |
|---|---|
| Lines | Trend line (2), Ray (2), Info line (2, stats box), Extended line (2), Trend angle (2, angle label), Horizontal line (1), Horizontal ray (1), Vertical line (1), Cross line (1) |
| Channels | Parallel channel (3), Regression trend (2, computes linear regression of closes between anchors with deviation bands), Flat top/bottom (3), Disjoint channel (4) |
| Pitchforks | Pitchfork (3), Schiff pitchfork (3), Modified Schiff pitchfork (3), Inside pitchfork (3), Pitchfan (3) |
| Gann | Gann box (2), Gann square fixed (1+scale), Gann square (2), Gann fan (2) |
| Fibonacci | Fib retracement (2, done), Trend-based fib extension (3), Fib channel (3), Fib time zone (2), Fib speed resistance fan (2), Trend-based fib time (3), Fib circles (2), Fib spiral (2), Fib speed resistance arcs (2), Fib wedge (3) |
| Patterns | XABCD (5), Cypher (5), Head and shoulders (7), ABCD (4), Triangle pattern (4), Three drives (7) |
| Elliott waves | Impulse (5: 1-2-3-4-5), Correction (3: A-B-C), Triangle (5: A-B-C-D-E), Double combo (3: W-X-Y), Triple combo (5: W-X-Y-X-Z) |
| Cycles | Cyclic lines (2), Time cycles (2), Sine line (2) |
| Projection / measurement | Long position (risk/reward box), Short position, Forecast (2, with result after bar passes), Bars pattern (2, copies the bar shape between anchors), Ghost feed (poly), Projection (3), Anchored VWAP (1), Fixed range volume profile (2, done), Anchored volume profile (1, done), Price range (2), Date range (2), Date and price range (2) |
| Brushes | Brush (freehand), Highlighter (freehand, wide translucent) |
| Arrows | Arrow (2), Arrow marker (2), Arrow mark up/down/left/right (1) |
| Shapes | Rectangle (2), Rotated rectangle (3), Path (poly, open), Circle (2), Ellipse (2), Polyline (poly, closed), Triangle (3), Arc (3), Curve (3, quadratic), Double curve (4, cubic) |
| Text & notes | Text (1), Anchored text (1, screen-anchored), Note (1, collapsed icon + popup), Anchored note (1), Callout (2), Comment (1), Price label (1), Price note (2), Signpost (1), Flag mark (1), Table (1, rows×cols cells editable) |
| Icons | Emoji / sticker / icon picker (1) — built-in SVG icon set and Unicode emoji, no external assets |

## 5. Acceptance

- Every tool: create (all creation modes that apply), select, move, edit each handle, settings window with its
  fields, persists across reload / interval change / symbol round trip, hit-test unit tests (hit + miss),
  renders in dark and light themes, appears in its toolbar flyout with an icon and label.
- Menus, floating toolbar, object tree, templates, undo/redo, copy/paste, multi-select covered by e2e.
- Screenshot sheet per family in `docs/verification/drawings-<family>.png`.

## 7. Per-tool menus and settings (user requirement, 2026-10-13)

Every tool has its **own** context menu and its **own** settings window. The generic menu/settings in §2–§3
are only defaults that each tool assembles, extends or overrides (`DrawingToolDef.contextMenu`, per-tool
`SettingsSchema` with tool-specific tabs). The exact per-tool option sets (keys, labels, types, choices,
defaults, tab placement) and menu items come from a facts-only behavioral catalog derived from observing the
reference product; implementations stay our own. All menus, dialogs and floating toolbars share one
streamlined visual language (theme tokens + shared CSS).

## 6. How to add a tool (registry pattern) — frozen API

Everything generic (creation modes, selection, multi-select, move/handles, Ctrl/Alt+drag clone,
nudge, copy/paste, undo/redo, lock/hide, visibility, templates, floating toolbar, context menu,
settings window, toolbar flyout + favorites, object tree, persistence, alerts menu entry) is
wired. A tool is **one module plus one line in its family index**. The API below is frozen: only
additive, backward-compatible changes from now on.

### Files you edit (per family)

| What | Where |
|---|---|
| Tool module (one per tool) | `web/src/chart/drawings/tools/<family>/<tool>.ts` |
| Registration | append to the array in `web/src/chart/drawings/tools/<family>/index.ts` |
| Pure geometry (hit-tests, levels, projections) | `core/src/drawings/<family>.ts` (no DOM, no dependencies) + tests in `core/test/drawings-<family>.test.ts`; append `export * from "./drawings/<family>";` to `core/src/index.ts` and import it in the tool from `"@qt/core"` |
| Tool-specific tests | `web/test/drawings-<family>.test.ts` |
| Screenshot sheet | `docs/verification/drawings-<family>.png` (`node tools/drawing-sheets.mjs <target> <testServer>`: every tool of the family drawn, dark and light; plus `drawings-flyouts.png`) |

Families: `lines`, `channels`, `pitchforks`, `gann`, `fibonacci`, `patterns`, `elliott`,
`cycles`, `projection`, `brushes`, `arrows`, `shapes`, `text`, `icons` (`measure` = bottom
toolbar tools). The left toolbar groups families as in `web/src/chart/drawings/toolbarGroups.json`
(Trend tools = lines + channels + pitchforks, Gann and Fibonacci tools = fibonacci + gann,
Patterns = patterns + elliott + cycles, Forecasting and measurement tools = projection, Geometric
shapes = brushes + arrows + shapes, Annotation tools = text, Icons). Flyout sections are the
family labels; a tool can set `section` (e.g. "Volume-based", "Measurers") to start its own section.

### Shared files you must NOT edit

`web/src/chart/drawings/{types.ts, registry.ts, builders.ts, schema.ts, draw.ts, floatbar.ts,
creation.ts, history.ts, clipboard.ts, templateStore.ts, DrawingController.ts, render.ts,
families.json, toolbarGroups.json}`, `web/src/chart/drawings/tools/index.ts`,
`web/src/state/{drawingMenu.ts, drawingActions.ts, drawingPrefs.ts, chartMenuFor.ts, menus.ts}`,
`web/src/components/{DrawingToolbar, DrawingFloatBar, DrawingSettings, ColorPicker, ContextMenu,
FavoritesBar, icons, icons28, drawIcons}.tsx`, `web/src/components/drawing/*`,
`web/src/chart/{ChartEngine.ts, Interaction.ts, render.ts}`, `core/src/types.ts`,
`core/src/drawings/{geometry,edit,templates}.ts`, the styles, `server/*`, and the harness
(`web/test/drawings-conformance.test.ts`, `web/test/drawings/*`, `tools/test-drawings.mjs`).
Exception: append one `export * from "./drawings/<family>";` line to `core/src/index.ts`.
If you need a shared change, ask for it; do not patch around it.

### The contract (`web/src/chart/drawings/types.ts`)

- `type` is stored in layouts: choose it once (camelCase, e.g. `pitchfork`, `fibExtension`),
  never rename it. `catalogType` names the catalog entry it implements (e.g. `"LineToolPitchfork"`).
- `anchors: n` = click-per-anchor (tools with 2+ anchors also get drag-to-create; `dragCreate:
  false` opts out); `"freehand"` = pointer path in `points` (RDP-simplified); `"poly"` = clicked
  vertices in `points` (Enter / double-click finishes, Esc removes the last vertex).
  Freehand/poly drawings keep `anchors: []`.
- `hotkey` ("Alt+T", "Alt+Shift+R") with `hotkeyAction: "select"` (default) or `"draw-at-cursor"`
  (one-anchor tools: Alt+H, Alt+J, Alt+V, Alt+C).
- **Factory defaults** (catalog defaults) go in `defaults` (style) and `defaultProps` (props): new
  drawings are created with them. A field's `default` is the *fallback for drawings without the
  value* (old layouts) — keep it equal to the factory value for new tools.
- Storage: shared style keys `style.color`, `style.width`, `style.lineStyle` ("solid" | "dotted" |
  "dashed"), `style.fillColor` ("#rrggbbaa", alpha = catalog background opacity), `style.textColor`,
  `style.textSize`, `style.bold`, `style.italic`, `style.levels` (level rows `{ ratio, color,
  visible, width?, lineStyle? }`), `text`; everything else in `props.<catalogKey>` (dots → `_`, e.g.
  `middleLine.showLine` → `props.middleLine_showLine`). Every field carries `catalog: "<catalog key>"`.
- `render(c, d)` draws the body; stroke color/width/dash/opacity are preset from `style`. Use
  `c.color`, `fillColor(d, c.color)`, `textStyleOf(d, c)`, `c.theme.*` — never hard-coded colors.
  Every visual field must change what `render` draws (the wiring test checks it); tag a field
  `visual: false` only when it truly has no visual effect, and give `testWith` when a field only
  shows in some state (e.g. stats position needs a stat on).
- `hitTest` tests the body only (handles first, by the controller); keep the math in core.
- `bounds` when the body is not covered by the handles' box (rubber-band selection);
  `onAnchorDrag` when one handle moves several anchors; `handles` when handles are not the anchors.
- Floating toolbar: `floatingToolbar` = the catalog's button ids (`templates`, `insert-column`,
  `insert-row`, `line-tool-color`, `background-color`, `text-color`, `font-size`,
  `line-tool-width`, `highlighter-width`, `style`, `settings`, `add-alert`, `lock`,
  `toggle-anchor`, `remove`, `more`); they render in the master order. Value buttons edit
  `style.color` / `style.fillColor` / `style.textColor` / `style.textSize` / `style.width` /
  `style.lineStyle` / `props.anchored` unless `floatBindings` maps them elsewhere (a field key or a
  `{ get, set }` binding, e.g. "set every level color").
- Menus: the generic menu follows `docs/reference/drawing-menus.json` exactly. Add tool items with
  `menuSection` (own section between Copy and Lock: pitchfork variants, Anchor, Degree ▸,
  Mirrored/Flipped) or `menuTop` (top + separator: Table add column / row). `alert` adds
  "Add alert on {menuName}…"; set `menuName` when the catalog text is not the label with a
  lower-case first letter (e.g. `menuName: "Fib retracement"`). `contextMenu` replaces the whole
  menu (build on `ctx.generic({ omit, insertAfter })`) — rarely needed.
- Settings window: `settings.style`, `settings.text`, `settings.inputs` ("Inputs" first), custom
  `settings.tabs`, `settings.coordinates` (`"time-price"` | `"price"` | `"time"` | `false` — match the
  catalog's Coordinates tab), `settings.visibility` (default on), `settings.tabOrder`.
- Additive contract extensions (after the freeze): a field may have `get(d)` / `set(d, v)` for
  derived values (e.g. stop in ticks ↔ the stop anchor) — the settings window and the harness use
  them; `onCreate(d, g)` runs once when a drawing is created (capture data instead of mutating in
  `render`); the floating toolbar has a second `background-color-2` button for two-color tools
  (bind it with `floatBindings`); color fields can be `clearable` ("Reset" in the picker, e.g. "Use
  one color"); level tables take `textColumn` for per-level labels (`FibLevel.text`); boolean
  select options are stored as booleans; `editText(d, g, x, y)` opens the shared inline text editor
  (multi-line; Enter = new line, Ctrl+Enter / click outside = commit, Esc = cancel) on creation and
  double-click; `onTranslate(d, dx, dy, g)` moves screen-anchored drawings; `toolbar: false` keeps a
  tool out of the flyouts; `picker(pick, cancel)` shows a chooser (icons, emoji, stickers) before
  placing; the floating width button lists the width field's own options (e.g. 8–96 px).
- Alerts: `alert: "line"` (crossing) or `"band"` (entering/exiting), only where the catalog offers
  "Add alert…" (`contextMenuHasAddAlert`). The one list of alert-capable types is
  `core/src/drawings/alerts.ts#DRAWING_ALERTS` (kind + value shape: line, levels, time, band);
  `drawingAlertValue(d, t)` there is what the server evaluates (`server/src/alerts/evaluate.ts`)
  and the alert dialog derives its channel types and operators from it
  (`web/src/panels/alerts/alertModel.ts`). A tool’s `alert` must equal its entry (web test
  `drawings-alerts.test.ts`, which also checks that the evaluated value lies on the drawn body).
  Lines exist where they are drawn (segment + extend flags).

Builders (`web/src/chart/drawings/builders.ts`): `styleFields({ extend, middlePoint, priceLabels,
stats, arrows, fill })`, `fillFields()`, `textFields({ background, align, wrap })`,
`levelTable(defaults, { catalogPrefix, lineColumns })`, `checkbox`, `numberField`, `select`,
`colorField`, `section`, `withCatalog(fields, { "style.color": "linecolor", … })`,
`catalogColor("rgba(41, 98, 255, 0.2)") → "#2962ff33"`, `CATALOG_LINESTYLE`. Canvas helpers
(`draw.ts`): `line`, `extend`, `polyline`, `arrowHead`, `strokeWith`, `fillColor`, `textColor`,
`drawText`, `textStyleOf`, `priceTag`, `statsBox`, `prop(d, key, fallback)`, `anchorHandles`, `FAR`.
Menu builders (`state/drawingMenu.ts`): `genericDrawingMenu`, `customizeMenu`, `templateMenu`,
`orderMenu`, `visibilityMenu`, `menuSequence`.

### From a catalog entry to a tool

1. `node tools/catalog-skeleton.mjs --list <family>` lists the catalog types of a family.
2. `node tools/catalog-skeleton.mjs LineToolPitchfork > /tmp/skeleton.ts` prints a starting
   `DrawingToolDef`: `catalogType`, label, anchors, hotkey, `floatingToolbar`, factory `defaults` /
   `defaultProps`, and every Style / Text / Inputs field with `catalog:` keys, choices and defaults
   (level groups become one `levelTable` with `catalogPrefix`). It reads only
   `docs/reference/drawing-tools-catalog.json`.
3. Rename storage keys to the shared ones where they exist, write the geometry in core, the
   renderer, hit-test and icon, register the tool, then run the harness until it is clean.
   Fields marked "unknown" in the catalog are exempt (listed by the harness).

### Conformance harness

`npm run test:drawings -- --family <family>` (or `-- --tool <type>`; no argument = every tool)
runs `web/test/drawings-conformance.test.ts` and writes `docs/verification/drawings-coverage[-<family>].md`:

- **Coverage:** every catalog tool of the family is registered (out-of-scope tools are listed with
  reasons in `web/test/drawings/allowlist.json`), anchors / creation mode match, every catalog
  field exists with the same tab, type, choices and factory default, the context menu equals the
  catalog's `contextMenuSequence`, the floating toolbar equals the catalog layout.
- **Wiring:** a recording 2D context renders each tool with each visual field at its default and
  at a changed value; the call log must change ("tool X field Y is not wired" otherwise);
  coordinates must move the geometry; visibility must hide the drawing on that interval group.
- **Settings window reachability:** every value field renders a control (`data-field`) in its tab
  in a state where it is shown (apply `testWith`), and writing a value through the field stores it.
- **Interaction smoke:** create through the controller with the tool's mode, hit a stroke point and
  miss 20 px away, drag every handle, build its menu and settings tabs, JSON round trip.
- **Left toolbar** (full run only): every reference toolbar item maps to a registered tool or an
  allow-listed exclusion, flyout order = reference order, and the flyouts list no other tool
  (tools outside the reference toolbar set `toolbar: false`).
- The report also counts settings-window reachability (fields with a control that stores the value)
  and tools passing the interaction smoke test.

Catalog mapping rules the harness understands: level keys `<prefix>N.<part>` (1-based, or 0-based
when a `<prefix>0.*` key exists; dotted prefixes such as `levels.` / `fanlines.` / `arcs.`; parts
`coeff`, `visible`, `color`, `width` / `linewidth` / `lineWidth`, `linestyle` / `lineStyle`), a
color-typed `transparency` (e.g. 85) maps to the alpha of the background color (1 − t/100), when a
tab has a separate `transparency` field the background color compares RGB only, `"per-drawing"`
defaults are not compared, and `(derived)` text defaults are free.

Zero failures for your family's tools is the definition of done.

### Icons

Every tool needs its own recognizable icon on a **28×28 grid**: `iconPath` (stroked path data)
plus optional `iconFill` (small solid parts). Rules: 1px strokes on half-pixel coordinates
(`M4.5 23.5L23.5 4.5`) so lines stay crisp; `currentColor` only; round caps/joins; keep 3px of
padding (art inside 3..25); anchors as 2.5px-radius circles; fills only for dots and arrow heads.
Draw your own shapes (no tracing of reference screenshots). Example (trend line):

```ts
iconPath: "M6.5 21.5L21.5 6.5",
iconFill: "M6.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM21.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
```

### Minimal complete example

`web/src/chart/drawings/tools/lines/crossline.example.ts` is a complete, compiling tool module
(Cross line from the catalog: one anchor, draw-at-cursor hotkey, catalog fields, floating toolbar,
alert, icon). It is not registered; the Lines family agent registers its real version.
