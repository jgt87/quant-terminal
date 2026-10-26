// Table (catalog LineToolTable): rows × columns of editable text cells, top-left corner at the
// anchor. "Add column to right" / "Add row below" in the menu and the floating toolbar; cells
// are edited in place (double-click a cell) or in the Cells tab (one row per line, cells separated
// by "|"). Can be anchored.

import { tableAddColumn, tableAddRow, tableCellRect, tableLayout, tableParse, tableSerialize, textApproxMeasure, textInRect, type Drawing, type Point } from "@qt/core";
import type { MenuItem } from "../../../../components/menuTypes";
import { prop, textFont } from "../../draw";
import type { DrawCtx, DrawingToolDef, FloatBinding, MenuExtrasCtx, ToolGeom } from "../../types";
import { F, HORZ_ALIGN } from "../shapes/kit";
import { anchorBinding, anchorHooks, anchorMenu, anchorPx, dragAnchorable, paint } from "./textKit";

const DEF = { rows: 2, cols: 2, content: "" };

function cellsOf(d: Drawing): string[][] {
  return tableParse(prop(d, "content", DEF.content), Math.max(1, prop(d, "rows", DEF.rows)), Math.max(1, prop(d, "cols", DEF.cols)));
}

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">, c?: DrawCtx) {
  const origin: Point = anchorPx(d, g);
  const size = d.style?.textSize ?? 14;
  const cells = cellsOf(d);
  let measure = textApproxMeasure(size);
  if (c) {
    const ctx = c.ctx;
    ctx.font = textFont(c.theme, { size });
    const w = ctx.measureText("M")?.width;
    if (typeof w === "number" && w > 0) measure = (s: string) => ctx.measureText(s).width;
  }
  return { origin, size, cells, l: tableLayout(cells, { size, padding: 6, minCell: 40 }, measure) };
}

/** Adds a column (to the right) or a row (below). */
export function tableGrow(d: Drawing, what: "column" | "row"): Drawing {
  const rows = Math.max(1, prop(d, "rows", DEF.rows));
  const cols = Math.max(1, prop(d, "cols", DEF.cols));
  const content = prop(d, "content", DEF.content);
  const next = what === "column" ? tableAddColumn(content, rows, cols) : tableAddRow(content, rows, cols);
  return { ...d, props: { ...d.props, ...next } };
}

/** Table with cell (row, col) set to `text` (line breaks become spaces: one row per content line). */
export function tableSetCell(d: Drawing, row: number, col: number, text: string): Drawing {
  const cells = cellsOf(d);
  if (!cells[row] || col < 0 || col >= cells[row].length) return d;
  cells[row][col] = text.replace(/\s*[\r\n]+\s*/g, " ").split("|").join("/").trim();
  return { ...d, props: { ...d.props, content: tableSerialize(cells) } };
}

/** Cell under (x, y) in px, or null. */
export function tableCellAt(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">, x: number, y: number): { row: number; col: number } | null {
  const { origin, cells, l } = layoutOf(d, g);
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = tableCellRect(l, origin, r, c);
      if (x >= cell.x && x <= cell.x + cell.width && y >= cell.y && y <= cell.y + cell.height) return { row: r, col: c };
    }
  }
  return null;
}

const growBinding = (what: "column" | "row"): FloatBinding => ({ get: () => false, set: (d) => tableGrow(d, what) });

export const table: DrawingToolDef = {
  type: "table",
  catalogType: "LineToolTable",
  family: "text",
  label: "Table",
  icon: "table",
  iconPath: "M4.5 6.5H23.5V21.5H4.5Z M4.5 11.5H23.5M4.5 16.5H23.5M14 6.5V21.5",
  anchors: 1,
  defaults: { fillColor: "#0f0f0f", textColor: "#dbdbdb", textSize: 14 },
  defaultProps: { borderColor: "#575757", horzAlign: "left", anchored: false, ...DEF },
  floatingToolbar: ["templates", "insert-column", "insert-row", "line-tool-color", "background-color", "text-color", "settings", "lock", "toggle-anchor", "remove", "more"],
  floatBindings: {
    "line-tool-color": "props.borderColor",
    "insert-column": growBinding("column"),
    "insert-row": growBinding("row"),
    "toggle-anchor": anchorBinding(),
  },
  menuTop: (d: Drawing, ctx: MenuExtrasCtx): MenuItem[] => [
    { id: "table-add-column", label: "Add column to right", onSelect: () => ctx.update((k) => tableGrow(k, "column")) },
    { id: "table-add-row", label: "Add row below", onSelect: () => ctx.update((k) => tableGrow(k, "row")) },
  ],
  menuSection: anchorMenu(),
  settings: {
    coordinates: false,
    style: [
      F.color("style.fillColor", "Background", "backgroundColor", "#0f0f0f"),
      F.color("props.borderColor", "Border", "borderColor", "#575757"),
      F.color("style.textColor", "Text color", "textColor", "#dbdbdb", { testWith: (d) => ({ ...d, props: { ...d.props, content: "A | B" } }) }),
      F.font("style.textSize", "Font size", "fontSize", 14),
      F.select("props.horzAlign", "Text alignment", "horzAlign", HORZ_ALIGN, "left", { testWith: (d) => ({ ...d, props: { ...d.props, content: "A | B" } }) }),
    ],
    tabs: [
      {
        id: "cells",
        label: "Cells",
        fields: [
          F.number("props.rows", "Rows", undefined, DEF.rows, { min: 1, max: 50, step: 1 }),
          F.number("props.cols", "Columns", undefined, DEF.cols, { min: 1, max: 20, step: 1 }),
          { kind: "text", key: "props.content", label: "Cells (one row per line, cells separated by |)", multiline: true, maxLength: 5000, default: "" },
        ],
      },
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { origin, l } = layoutOf(d, g);
    return textInRect(x, y, { x: origin.x, y: origin.y, width: l.width, height: l.height }, tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { origin, size, cells, l } = layoutOf(d, c, c);
    const border = prop(d, "borderColor", "#575757");
    ctx.beginPath();
    ctx.rect(origin.x, origin.y, l.width, l.height);
    paint(ctx, d.style?.fillColor ?? "#0f0f0f", border);
    const align = prop(d, "horzAlign", "left") as CanvasTextAlign;
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = textFont(c.theme, { size });
    ctx.fillStyle = d.style?.textColor ?? "#dbdbdb";
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    cells.forEach((row, r) =>
      row.forEach((text, col) => {
        const cell = tableCellRect(l, origin, r, col);
        if (r > 0 && col === 0) {
          ctx.beginPath();
          ctx.moveTo(origin.x, cell.y + 0.5);
          ctx.lineTo(origin.x + l.width, cell.y + 0.5);
          paint(ctx, null, border);
        }
        if (r === 0 && col > 0) {
          ctx.beginPath();
          ctx.moveTo(cell.x + 0.5, origin.y);
          ctx.lineTo(cell.x + 0.5, origin.y + l.height);
          paint(ctx, null, border);
        }
        if (!text) return;
        const x = align === "left" ? cell.x + l.padding : align === "right" ? cell.x + cell.width - l.padding : cell.x + cell.width / 2;
        ctx.fillText(text, x, cell.y + cell.height / 2);
      }),
    );
    ctx.restore();
  },
  handles: (d, g) => (d.anchors[0] ? [anchorPx(d, g)] : []),
  onAnchorDrag: (d, i, a, g) => dragAnchorable(d, i, a, g),
  ...anchorHooks(),
  // Double-click a cell to edit it in place (Enter on the selected table: the first cell).
  editText(d, g, x, y) {
    if (!d.anchors[0]) return null;
    const at = x !== undefined && y !== undefined ? tableCellAt(d, g, x, y) : { row: 0, col: 0 };
    if (!at) return null;
    const { origin, size, cells, l } = layoutOf(d, g);
    const rect = tableCellRect(l, origin, at.row, at.col);
    return {
      key: `props.cells_${at.row}_${at.col}`,
      rect: { x: rect.x, y: rect.y, width: Math.max(rect.width, 60), height: Math.max(rect.height, 24) },
      value: cells[at.row][at.col] ?? "",
      multiline: false,
      fontSize: size,
      color: d.style?.textColor ?? "#dbdbdb",
      apply: (k, text) => tableSetCell(k, at.row, at.col, text),
    };
  },
  bounds(d, g) {
    const { origin, l } = layoutOf(d, g);
    return { x: origin.x, y: origin.y, width: l.width, height: l.height };
  },
};
