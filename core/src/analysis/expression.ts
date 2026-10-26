// Spread / ratio symbol expressions, e.g. `AAPL/MSFT`, `BINANCE:BTCUSDT-BINANCE:ETHUSDT*20`,
// `(EURUSD=X+GBPUSD=X)/2`. Hand-written recursive-descent parser; nothing is ever evaluated
// as code.
//
// Grammar
//   expr    = term (("+" | "-") term)*
//   term    = unary (("*" | "/") unary)*        ("×" and "÷" are accepted too)
//   unary   = ("-" | "+") unary | primary
//   primary = number | symbol | '"' text '"' | "(" expr ")"
//
// Symbols are runs of letters, digits and `_ . : = ^ ! & $ # @`. A run that is a plain
// decimal number (e.g. `20`, `2.5`) is a number; anything else (`7203.T`, `1INCHUSDT`)
// is a symbol. Inside an expression `-` is always an operator, so symbols that contain
// a hyphen must be quoted: `"BTC-USD"/"ETH-USD"`.

import type { Bar } from "../types";

export type ExprNode =
  | { type: "num"; value: number }
  | { type: "sym"; symbol: string }
  | { type: "neg"; arg: ExprNode }
  | { type: "bin"; op: "+" | "-" | "*" | "/"; left: ExprNode; right: ExprNode };

export interface ParsedExpression {
  /** Distinct symbols in order of first appearance. */
  symbols: string[];
  ast: ExprNode;
}

export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "sym"; text: string; pos: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "(" | ")"; pos: number };

const SYMBOL_CHAR = /[A-Za-z0-9_.:=^!&$#@]/;
const NUMBER = /^(\d+(\.\d*)?|\.\d+)$/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ("+-*/()×÷".includes(ch)) {
      const op = ch === "×" ? "*" : ch === "÷" ? "/" : (ch as "+" | "-" | "*" | "/" | "(" | ")");
      out.push({ kind: "op", op, pos: i });
      i++;
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new ExpressionError("Unterminated quoted symbol", i);
      const text = src.slice(i + 1, end).trim();
      if (!text) throw new ExpressionError("Empty quoted symbol", i);
      out.push({ kind: "sym", text, pos: i });
      i = end + 1;
      continue;
    }
    if (SYMBOL_CHAR.test(ch)) {
      const start = i;
      while (i < src.length && SYMBOL_CHAR.test(src[i])) i++;
      const text = src.slice(start, i);
      if (NUMBER.test(text)) out.push({ kind: "num", value: Number(text), pos: start });
      else out.push({ kind: "sym", text, pos: start });
      continue;
    }
    throw new ExpressionError(`Unexpected character '${ch}'`, i);
  }
  return out;
}

/** Parses an expression; throws ExpressionError with a character position on bad input. */
export function parseExpression(src: string): ParsedExpression {
  const tokens = tokenize(src);
  let k = 0;
  const symbols: string[] = [];
  const peek = () => tokens[k];
  const isOp = (t: Token | undefined, ...ops: string[]): t is Extract<Token, { kind: "op" }> =>
    !!t && t.kind === "op" && ops.includes(t.op);

  const expr = (): ExprNode => {
    let left = term();
    for (let t = peek(); isOp(t, "+", "-"); t = peek()) {
      k++;
      left = { type: "bin", op: t.op as "+" | "-", left, right: term() };
    }
    return left;
  };
  const term = (): ExprNode => {
    let left = unary();
    for (let t = peek(); isOp(t, "*", "/"); t = peek()) {
      k++;
      left = { type: "bin", op: t.op as "*" | "/", left, right: unary() };
    }
    return left;
  };
  const unary = (): ExprNode => {
    const t = peek();
    if (isOp(t, "-")) {
      k++;
      return { type: "neg", arg: unary() };
    }
    if (isOp(t, "+")) {
      k++;
      return unary();
    }
    return primary();
  };
  const primary = (): ExprNode => {
    const t = peek();
    if (!t) throw new ExpressionError("Unexpected end of expression", src.length);
    k++;
    if (t.kind === "num") return { type: "num", value: t.value };
    if (t.kind === "sym") {
      if (!symbols.includes(t.text)) symbols.push(t.text);
      return { type: "sym", symbol: t.text };
    }
    if (t.op === "(") {
      const inner = expr();
      const close = peek();
      if (!isOp(close, ")")) throw new ExpressionError("Missing ')'", close ? close.pos : src.length);
      k++;
      return inner;
    }
    throw new ExpressionError(`Unexpected '${t.op}'`, t.pos);
  };

  if (tokens.length === 0) throw new ExpressionError("Empty expression", 0);
  const ast = expr();
  if (k < tokens.length) throw new ExpressionError("Unexpected token", tokens[k].pos);
  return { symbols, ast };
}

/**
 * True when `src` should be treated as an expression rather than a plain symbol.
 * A string whose only operator characters are hyphens with no whitespace around them
 * (`BTC-USD`, `BRK-B`) is a plain symbol; write `A - B` with spaces (or use other
 * operators/parentheses) to mean a difference. Unparseable strings are not expressions.
 */
export function isExpression(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  if (!/[+*/()×÷"\s]/.test(s)) return false; // only bare hyphens → plain symbol
  try {
    const { ast } = parseExpression(s);
    return ast.type !== "sym";
  } catch {
    return false;
  }
}

function evalNode(node: ExprNode, value: (symbol: string) => number): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "sym":
      return value(node.symbol);
    case "neg":
      return -evalNode(node.arg, value);
    case "bin": {
      const a = evalNode(node.left, value);
      const b = evalNode(node.right, value);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      return a / b;
    }
  }
}

function collectSymbols(node: ExprNode, out: Set<string>): Set<string> {
  if (node.type === "sym") out.add(node.symbol);
  else if (node.type === "neg") collectSymbols(node.arg, out);
  else if (node.type === "bin") {
    collectSymbols(node.left, out);
    collectSymbols(node.right, out);
  }
  return out;
}

/**
 * Evaluates the expression bar by bar.
 * - Bars are aligned by time (inner join: only times present in every symbol's series).
 * - open/high/low/close are each computed by applying the expression to that field.
 *   Because ratios and differences can swap extremes (A/B is highest when B is lowest),
 *   high/low are then recomputed as the max/min of the four field results, so
 *   high >= max(open, close) and low <= min(open, close) always hold.
 * - volume: the symbol's volume when the expression references exactly one symbol, else 0.
 * - Bars whose result is not finite (e.g. division by zero) are dropped.
 * - A missing series throws; an expression without symbols yields [].
 */
export function evaluateExpression(ast: ExprNode, seriesBySymbol: Record<string, Bar[]>): Bar[] {
  const symbols = [...collectSymbols(ast, new Set())];
  if (symbols.length === 0) return [];
  const maps = symbols.map((s) => {
    const series = seriesBySymbol[s];
    if (!series) throw new Error(`No bars for symbol ${s}`);
    const m = new Map<number, Bar>();
    for (const b of series) m.set(b.time, b);
    return m;
  });
  const base = seriesBySymbol[symbols[0]];
  const out: Bar[] = [];
  for (const b0 of base) {
    const row: Record<string, Bar> = {};
    let ok = true;
    for (let s = 0; s < symbols.length; s++) {
      const b = maps[s].get(b0.time);
      if (!b) {
        ok = false;
        break;
      }
      row[symbols[s]] = b;
    }
    if (!ok) continue;
    const f = (field: "open" | "high" | "low" | "close") => evalNode(ast, (sym) => row[sym][field]);
    const o = f("open");
    const h = f("high");
    const l = f("low");
    const c = f("close");
    if (![o, h, l, c].every(Number.isFinite)) continue;
    out.push({
      time: b0.time,
      open: o,
      high: Math.max(o, h, l, c),
      low: Math.min(o, h, l, c),
      close: c,
      volume: symbols.length === 1 ? row[symbols[0]].volume : 0,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}
