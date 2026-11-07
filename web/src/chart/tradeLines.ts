// Paper trading on the chart: order, bracket and position lines of the selected paper account for
// the chart's symbol, their geometry for hit-testing, and drawing. Simulated orders only.

import { formatNumber } from "./format";
import { font, withAlpha, type ChartTheme } from "./theme";
import type { PaneRenderCtx } from "./renderers/types";

export type TradeLineKind = "order" | "stop" | "stop-loss" | "take-profit" | "position";
/** Order field a drag changes. */
export type TradeLineField = "price" | "stopPrice" | "stopLoss" | "takeProfit";

export interface TradeLine {
  id: string;
  kind: TradeLineKind;
  side: "buy" | "sell";
  price: number;
  text: string;
  /** Order the line belongs to (none for the position line). */
  orderId?: string;
  /** Field of `orderId` a drag changes; null = not draggable. */
  field: TradeLineField | null;
  /** The × button: cancels the order, removes the bracket leg, or closes the position. */
  action: "cancel" | "remove-leg" | "close";
}

/** Minimal views of the paper API objects (see api/paper.ts). */
export interface TradeOrderView {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: number;
  price?: number;
  stopPrice?: number;
  triggered?: boolean;
  trailAmount?: number;
  trailPercent?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: string;
  parentId?: string;
  role?: string;
}
export interface TradeAccountView {
  orders: TradeOrderView[];
  positions: Record<string, { qty: number; avgPrice: number; unrealizedPnl?: number | null }>;
}

const key = (s: string) => s.trim().toUpperCase();
/** " (2%)" or " (1.50)" after a trailing stop's level. */
const trailText = (o: TradeOrderView, fmt: (p: number) => string) =>
  o.trailPercent !== undefined ? ` (${formatNumber(o.trailPercent)}%)` : o.trailAmount !== undefined ? ` (${fmt(o.trailAmount)})` : "";
const TYPE_TEXT: Record<string, string> = { limit: "LMT", stop: "STP", "stop-limit": "STP LMT", "trailing-stop": "TRAIL", market: "MKT" };

/** Lines of `acc` for `symbol`: working orders (and their pending brackets) and the open position. */
export function tradeLinesFor(acc: TradeAccountView | null, symbol: string, fmt: (p: number) => string = (p) => formatNumber(p)): TradeLine[] {
  if (!acc || !symbol) return [];
  const sym = key(symbol);
  const out: TradeLine[] = [];
  for (const o of acc.orders) {
    if (o.status !== "working" || key(o.symbol) !== sym || o.price === undefined) continue;
    const side = o.side;
    if (o.role === "stop-loss" || o.role === "take-profit") {
      out.push({ id: `${o.id}:price`, kind: o.role, side, price: o.price, text: `${o.role === "stop-loss" ? "SL" : "TP"} ${o.qty}`, orderId: o.id, field: "price", action: "cancel" });
      continue;
    }
    const verb = side === "buy" ? "Buy" : "Sell";
    out.push({ id: `${o.id}:price`, kind: "order", side, price: o.price, text: `${verb} ${TYPE_TEXT[o.type] ?? o.type} ${o.qty} @ ${fmt(o.price)}${trailText(o, fmt)}`, orderId: o.id, field: "price", action: "cancel" });
    if (o.type === "stop-limit" && o.stopPrice !== undefined && !o.triggered) {
      out.push({ id: `${o.id}:stop`, kind: "stop", side, price: o.stopPrice, text: `${verb} stop ${fmt(o.stopPrice)}`, orderId: o.id, field: "stopPrice", action: "cancel" });
    }
    // Brackets of an order that has not filled yet live on the order itself.
    if (o.stopLoss !== undefined) out.push({ id: `${o.id}:sl`, kind: "stop-loss", side, price: o.stopLoss, text: `SL ${o.qty}`, orderId: o.id, field: "stopLoss", action: "remove-leg" });
    if (o.takeProfit !== undefined) out.push({ id: `${o.id}:tp`, kind: "take-profit", side, price: o.takeProfit, text: `TP ${o.qty}`, orderId: o.id, field: "takeProfit", action: "remove-leg" });
  }
  const pos = Object.entries(acc.positions).find(([s]) => key(s) === sym)?.[1];
  if (pos && pos.qty !== 0) {
    const pnl = pos.unrealizedPnl;
    const pnlText = pnl == null ? "" : `  ${pnl >= 0 ? "+" : ""}${formatNumber(pnl)}`;
    out.push({
      id: "position",
      kind: "position",
      side: pos.qty > 0 ? "buy" : "sell",
      price: pos.avgPrice,
      text: `${pos.qty > 0 ? "Long" : "Short"} ${Math.abs(pos.qty)} @ ${fmt(pos.avgPrice)}${pnlText}`,
      field: null,
      action: "close",
    });
  }
  return out;
}

export function tradeLineColor(t: ChartTheme, l: TradeLine): string {
  if (l.kind === "position") return t.accent;
  if (l.kind === "stop-loss") return t.down;
  if (l.kind === "take-profit") return t.up;
  return l.side === "buy" ? t.up : t.down;
}

/** Label box and × button of a line in pane coordinates. */
export interface TradeLineBoxes {
  y: number;
  label: { x: number; y: number; w: number; h: number };
  close: { x: number; y: number; w: number; h: number };
}

const LABEL_X = 8;
const BOX_H = 18;

export function tradeLineBoxes(ctx: Pick<CanvasRenderingContext2D, "measureText" | "font">, theme: ChartTheme, l: TradeLine, y: number, x = LABEL_X): TradeLineBoxes {
  ctx.font = font(theme, 11, 500);
  const w = Math.ceil(ctx.measureText(l.text).width) + 12;
  const top = y - BOX_H / 2;
  return { y, label: { x, y: top, w, h: BOX_H }, close: { x: x + w, y: top, w: BOX_H, h: BOX_H } };
}

/**
 * Boxes of all lines: labels whose rows would overlap move right, past the label they collide with,
 * so every label and × button stays readable and clickable.
 */
export function layoutTradeLines(ctx: Pick<CanvasRenderingContext2D, "measureText" | "font">, theme: ChartTheme, lines: readonly TradeLine[], toY: (p: number) => number): TradeLineBoxes[] {
  const order = lines.map((l, i) => ({ i, y: toY(l.price) })).sort((a, b) => a.y - b.y);
  const out: TradeLineBoxes[] = new Array(lines.length);
  const placed: TradeLineBoxes[] = [];
  for (const { i, y } of order) {
    let x = LABEL_X;
    for (const p of placed) {
      if (Math.abs(p.y - y) < BOX_H) x = Math.max(x, p.close.x + p.close.w + 4);
    }
    const b = tradeLineBoxes(ctx, theme, lines[i], y, x);
    placed.push(b);
    out[i] = b;
  }
  return out;
}

const inside = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** What of a line is under (x, y) in pane coordinates: its × button, its label or the line itself. */
export function tradeLineHit(ctx: Pick<CanvasRenderingContext2D, "measureText" | "font">, theme: ChartTheme, lines: readonly TradeLine[], toY: (p: number) => number, x: number, y: number, tol = 4): { line: TradeLine; part: "close" | "label" | "line" } | null {
  const boxes = layoutTradeLines(ctx, theme, lines, toY);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const b = boxes[i];
    if (inside(b.close, x, y)) return { line: l, part: "close" };
    if (inside(b.label, x, y)) return { line: l, part: "label" };
    if (Math.abs(y - b.y) <= tol) return { line: l, part: "line" };
  }
  return null;
}

/** Draws the lines: dashed level across the plot, a label box with the order text and a × button. */
export function drawTradeLines(rc: PaneRenderCtx, lines: readonly TradeLine[], drag: { id: string; price: number } | null): void {
  const { ctx, ps, width, theme } = rc;
  const shown = lines.map((l) => {
    const dragging = drag?.id === l.id;
    return dragging ? { ...l, price: drag.price, text: `${l.text.replace(/ @ .*$/, "")} → ${ps.format(drag.price)}` } : l;
  });
  const boxes = layoutTradeLines(ctx, theme, shown, (p) => Math.round(ps.toY(p)) + 0.5);
  shown.forEach((l, k) => {
    const y = boxes[k].y;
    if (y < -BOX_H || y > rc.height + BOX_H) return;
    const color = tradeLineColor(theme, l);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(l.kind === "position" ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = l.text;
    const b = boxes[k];
    ctx.fillStyle = theme.background;
    ctx.fillRect(b.label.x, b.label.y, b.label.w + b.close.w, b.label.h);
    ctx.fillStyle = withAlpha(color, 0.2);
    ctx.fillRect(b.label.x, b.label.y, b.label.w, b.label.h);
    ctx.strokeStyle = color;
    ctx.strokeRect(b.label.x + 0.5, b.label.y + 0.5, b.label.w + b.close.w - 1, b.label.h - 1);
    ctx.fillStyle = theme.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, b.label.x + 6, y);
    // × button.
    const c = b.close;
    ctx.beginPath();
    ctx.moveTo(c.x + 5, c.y + 5);
    ctx.lineTo(c.x + c.w - 5, c.y + c.h - 5);
    ctx.moveTo(c.x + c.w - 5, c.y + 5);
    ctx.lineTo(c.x + 5, c.y + c.h - 5);
    ctx.stroke();
  });
}
