# Drawing UI visual language

Measured on 2026-10-13 from the live web chart (Chrome, 1689x1277 viewport, dark theme, English UI). Values come from computed styles and the page's stylesheet rules. Screenshots are in the analysis screenshots (not copied). Colours are the values that this session's theme variables resolve to. Light-theme values were resolved by evaluating the same variables under `data-theme="light"`. The account in this session uses a neutral-grey palette, and other themes may differ.

Font stack everywhere: `-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif`.

## Shared popup surface (context menu, flyouts, dropdowns, colour picker)

| Property | Value |
|---|---|
| Background | dark `#1f1f1f`, light `#ffffff` (`--color-popup-background`) |
| Corner radius | 6px |
| Shadow | `0 2px 4px` + dark `#0006` (rgba 0,0,0,0.4), light `#0003` |
| Vertical padding of the item list | 6px top and bottom |
| Scrollbar | 5px wide, thumb radius 3px, dark `#3d3d3d`, light `#9c9c9c` |

## Context menu (`context-menu-trendline.png`, `context-menu-chart-background.png`)

- **Layout:** a table with two columns (icon cell and content cell). The trend-line menu measured 256.9px wide.
- **Item row:** 32px high (`normal`); the `big` variant is 68px.
  - Text: 14px, weight 400, colour dark `#dbdbdb` / light `#0f0f0f`.
- **Icon column:** 36px wide in total (min 6px when no item has an icon).
  - Icon box: 28x28 SVG, padding-inline-start 8px, box width 28px, centred.
- **Content cell:** flex row, padding-inline 4px (start) and 20px (end), max-width 365px.
  - Label: padding-inline-start 2px, flex 1, overflow hidden.
- **Shortcut hint:**
  - Font: 12px, padding-top 2px, margin-inline-start 10px.
  - Colour: dark `#636363` / light `#9c9c9c`.
  - Examples: "Alt + A", "Ctrl + Drag", "Ctrl + C", "Del".
- **Submenu arrow:** a chevron SVG, 10px high, filled with the current colour, margin-inline-start 10px. It is mirrored in RTL.
- **Separator:** a 1px line with 6px vertical margin, so each separator takes 13px.
  - Colour: dark `#4a4a4a` / light `#ebebeb`.
- **Hover:**
  - Background: dark `#2e2e2e` / light `#f2f2f2`.
  - Text: dark `#c9c9c9` / light `#0f0f0f`.
- **Pressed (`:active`):** dark `#3d3d3d` / light `#ebebeb`.
- **Active (selected) item:**
  - Background: dark `#f2f2f2` / light `#2e2e2e` (inverted).
  - Text: dark `#000` / light `#fff`.
  - Shortcut in the active item: dark `#0f0f0f` / light `#fff`.
- **Disabled:** opacity 0.5. It keeps the popup background and gets no hover.
- **Checkable items:** Lock and Hide are checkable actions. They show a 28px icon and no check glyph in the drawing menu.
- **Icons in the trend-line menu:** Add alert, Visual order, Clone, Lock, Hide, Remove and Settings… have icons. Template, Visibility on intervals, Object tree and Copy do not.

## Settings dialog (`settings-*.png`)

- **Dialog frame:**
  - 380px wide.
  - Background dark `#1f1f1f`, radius 6px, shadow `0 2px 4px rgba(0,0,0,.4)`.
  - Height grows with content, up to the viewport. The fib retracement dialog was about 1237px and scrolls internally.
- **Header:**
  - Padding 0 20px.
  - Title: 20px, weight 600, line-height 28px, padding 17px 0, so the header is 62px high.
  - A pencil (rename) icon follows the title.
  - Close button: an 18px icon with 8px padding (34px hit area), margin-right -3px.
- **Tab bar:**
  - Underline tabs, padding 0 20px, 32px high.
  - Tab text: 16px, weight 600, line-height 24px, padding-bottom 8px, 12px gap between tabs.
  - Selected tab: a 4px high underline bar that slides with a transform.
  - Full-width rail: a 4px track in a neutral grey, visible in the screenshots.
  - Tab order observed: Style, Text, Coordinates, Visibility (Inputs first for tools that have it — inferred, not observed). The dialog reopens on the last active tab.
- **Content area:**
  - CSS grid with `grid-template-columns: auto 1fr`, padding 16px 20px, max-width 550px.
  - Label column: padding-inline-end 20px; the first letter is capitalised. With the trend line it measured about 105px.
  - Each cell has 8px vertical padding. The rows came out 50px tall with 34px controls.
  - Full-width rows (checkbox + label) span both columns.
  - Offset (indented) rows: padding-inline-start 26px.
  - Group separator: 8px (16px for `big`).
  - Group title (for example "INFO"): 11px uppercase, colour dark `#8c8c8c`.
- **Checkbox:**
  - 18x18, 1px border, radius 3px.
  - Unchecked border dark `#f2f2f2`; checked fill is the same colour, with a dark check mark.
  - Background and border colours transition over 0.35s.
  - The label sits to the right of the box.
- **Select (dropdown button):**
  - 34px high, 1px border dark `#575757`, radius 8px, 14px text, caret on the right.
  - Width: 180px in the label/control grid, smaller inline (for example 100px for alignment pairs).
- **Colour + line control ("Line" row):**
  - Wrapper: 75x34, 1px border `#575757`, radius 6px.
  - Inside: a 24x24 colour swatch (radius 3px) and a 30x24 line-sample segment (margins 8px/3px).
  - Clicking the control opens the colour picker popup.
  - Two extra 34px square buttons follow it for left-end and right-end shape (picker width 34px).
- **Colour picker popup** (`settings-color-picker.png`):
  - Shared popup surface, 250px wide.
  - Swatch grid: 10 columns, swatches 17x17 with 3px margin and radius 2px.
  - Row 1 is greys: `#ffffff #dbdbdb #b8b8b8 #9c9c9c #808080 #636363 #4a4a4a #2e2e2e #0f0f0f #000000`.
  - Row 2 is the main hues: `#f23645 #ff9800 #ffeb3b #4caf50 #089981 #00bcd4 #2962ff #673ab7 #9c27b0 #e91e63`.
  - Rows 3 to 8 are tints and shades of those hues (60 swatches; the exact values are in the palette capture used for this file).
  - After a divider come the custom colours row and a "+" button to add a custom colour.
  - Opacity slider: a gradient over a checkerboard, with a numeric "%" box next to it.
  - "Thickness": 4 segmented buttons for 1 to 4px.
  - "Line style": 3 segmented buttons for solid, dashed and dotted.
  - The thickness and line-style sections appeared for the line property (whether they appear for fill colours was not checked).
- **Level table** (fib, gann, pitchfork):
  - Two columns of level rows.
  - Each row has a checkbox, a numeric coefficient input (about 98x34) and a colour swatch button (34x34).
  - Disabled (unchecked) levels show a dimmed coefficient.
  - Below the table: "Use one color" (a split-colour swatch), then Background (checkbox + opacity slider) and the remaining options.
- **Coordinates tab:** one row per anchor, "#n (price, bar)". It holds a price input (step 0.01, the symbol tick) and a bar-index input (step 1).
- **Visibility tab:** each row has a checkbox, a "from" number box (with spinner), a two-handle slider and a "to" number box. Ticks and Ranges are checkbox only.
- **Footer:**
  - Separated by a 1px top border (dark `#4a4a4a`), padding 16px 20px.
  - Left: a "Template" dropdown button (100x34, border `#575757`, radius 8px).
  - Right: Cancel (secondary: 1px border `#ffffff`, radius 8px, padding 0 11px, 34px high) and Ok (primary: fill `#f2f2f2`, text `#0f0f0f`, radius 8px, 34px high), 12px apart.

## Floating toolbar (`floating-toolbar-trendline.png`, `floating-toolbar-more-menu.png`, `floating-toolbar-templates-menu.png`)

- **Container:**
  - Background dark `#1f1f1f`, radius 6px, shadow `0 2px 4px rgba(0,0,0,.4)`, 38px high.
  - Draggable by a 24x38 grip on the left (dotted icon in `#575757`).
- **Buttons:**
  - 38x38 cells with a 28x28 icon.
  - The width button is 68px wide (padding 11px 11px 11px 10px) and shows a line sample plus the "2px" text.
  - There are no visible separators between buttons.
- **Colour buttons** (line, background, text) show the current colour as a 4px bar under the icon.
- **Hover:**
  - A rounded background appears inside the cell (inset 2px, radius 2px by default).
  - Colour: dark `#2e2e2e` / light `#f2f2f2`.
  - An opened dropdown uses the same colour (`--color-toolbar-opened-element-bg`).
  - Text colour on hover: dark `#dbdbdb` / light `#0f0f0f`.
- **Order:** see `drawing-menus.json → floatingToolbar.buttonOrderMaster`. The trend line toolbar was 434px wide with 10 cells.
- **Dropdowns:**
  - The "More" menu (Visual order ▸, Visibility on intervals ▸, Clone, Copy, Hide) uses the same popup style as the context menu.
  - The Templates dropdown has "Save Drawing Template As…" and "Apply Default Drawing Template".

## Left drawing toolbar and flyouts (`left-toolbar-flyout-*.png`)

- **Toolbar:**
  - Column 52px wide; each group button is 52x38.
  - The flyout arrow is an 11px-wide hit area at the button's right edge (a 4px chevron).
- **Flyout:**
  - Shared popup surface. Widths are content-dependent (about 205 to 376px; 281px for Trend tools).
  - Inner padding 0 6px.
  - Section title: 11px, uppercase, `#8c8c8c`, 16px high.
  - Sections are separated by a 1px divider.
- **Flyout row:**
  - 40px high, radius 6px, padding 2px 4px.
  - Contents: a 28x28 icon, then the 14px label.
  - On hover, an 18x18 help (?) icon appears after the label (`#575757`).
  - The hotkey hint is right-aligned, 12px, `#8c8c8c` (for example "Alt + T").
  - The favourite star is a 24x24 icon button (radius 4px, `#8c8c8c`) at the far right. It is visible on hover (persistent display for favourites not verified).
  - Row hover background: dark `#2e2e2e`. The focus ring is a 2px `#2962ff` outline with radius 6px.

## Key colour tokens (light / dark)

| Token | Light | Dark |
|---|---|---|
| popup background | #fff | #1f1f1f |
| popup text | #0f0f0f | #dbdbdb |
| popup hover background | #f2f2f2 | #2e2e2e |
| popup hint text | #9c9c9c | #636363 |
| menu separator | #ebebeb | #4a4a4a |
| shadow | #0003 | #0006 |
| toolbar button hover bg | #f2f2f2 | #2e2e2e |
| secondary text (group titles) | #707070 | #8c8c8c |
| control border (inputs/selects) | n/a (not measured) | #575757 |
| focus outline / accent | #2962ff | #2962ff |
