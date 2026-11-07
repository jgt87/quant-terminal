// Paper trading on the chart: shows the selected paper account's working orders, brackets and
// position for the chart's symbol as lines, and turns line drags / × clicks into order changes,
// cancels and position closes. Simulated only; nothing reaches a broker.

import { useEffect } from "react";
import { cancelPaperOrder, closePaperPosition, getPaper, listPaper, modifyPaperOrder, placePaperOrder, type PaperAccountView } from "../api/paper";
import { errorText } from "../api/http";
import { formatPrice } from "../chart/format";
import type { ChartEngine } from "../chart/ChartEngine";
import { tradeLinesFor, type TradeLine } from "../chart/tradeLines";
import { loadLocal } from "../panels/common/storage";
import { pushToast } from "../panels/common/toasts";
import { PAPER_POLL_MS, PAPER_SELECTED_KEY } from "./paper";

/** Selected paper account id (the panel's choice, else the first account), null when there is none. */
export async function selectedAccount(): Promise<string | null> {
  const list = await listPaper();
  const want = loadLocal<string | null>(PAPER_SELECTED_KEY, null);
  return (list.find((a) => a.id === want) ?? list[0])?.id ?? null;
}

/** What a line action does on the server. */
export function tradeRequest(line: TradeLine, action: { kind: "move"; price: number } | { kind: "button" }):
  | { op: "modify"; orderId: string; patch: Record<string, number | null> }
  | { op: "cancel"; orderId: string }
  | { op: "close" }
  | null {
  if (action.kind === "move") return line.orderId && line.field ? { op: "modify", orderId: line.orderId, patch: { [line.field]: action.price } } : null;
  if (line.action === "close") return { op: "close" };
  if (!line.orderId) return null;
  if (line.action === "remove-leg" && (line.field === "stopLoss" || line.field === "takeProfit")) return { op: "modify", orderId: line.orderId, patch: { [line.field]: null } };
  return { op: "cancel", orderId: line.orderId };
}

/**
 * One-click paper order from the chart's buy / sell buttons: a market order of `qty` on the selected
 * paper account. Resolves with the filled or working order's text, or throws a readable error.
 */
export async function quickOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<string> {
  if (!(qty > 0) || !Number.isFinite(qty)) throw new Error("Enter a quantity above 0");
  const id = await selectedAccount();
  if (!id) throw new Error("There is no paper account yet: create one in the Paper trading panel");
  const { order } = await placePaperOrder(id, { symbol, side, type: "market", qty });
  const at = order.fillPrice !== undefined ? ` at ${formatPrice(order.fillPrice)}` : "";
  return `${side === "buy" ? "Bought" : "Sold"} ${qty} ${symbol}${at} (paper, ${order.status})`;
}

export function useChartTrading(engine: ChartEngine | null, symbol: string): void {
  useEffect(() => {
    if (!engine || !symbol) return;
    let alive = true;
    let accountId: string | null = null;
    let timer = 0;
    let listedAt = 0;
    const show = (acc: PaperAccountView | null) => alive && engine.setTradeLines(tradeLinesFor(acc, symbol, (p) => engine.mainPane.ps.format(p)));

    const refresh = async () => {
      try {
        // The account list rarely changes: look again every 30 s.
        if (!accountId || Date.now() - listedAt > 30_000) {
          accountId = await selectedAccount();
          listedAt = Date.now();
        }
        show(accountId ? await getPaper(accountId) : null);
      } catch {
        /* paper trading is optional on the chart */
      }
    };
    const loop = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (alive) timer = window.setTimeout(loop, PAPER_POLL_MS);
    };
    void loop();

    const off = engine.events.on("tradeAction", (a) => {
      const req = tradeRequest(a.line, a.kind === "move" ? { kind: "move", price: a.price } : { kind: "button" });
      const id = accountId;
      if (!req || !id) return;
      const run = req.op === "modify" ? modifyPaperOrder(id, req.orderId, req.patch) : req.op === "cancel" ? cancelPaperOrder(id, req.orderId) : closePaperPosition(id, symbol);
      run
        .catch((e) => pushToast({ title: "Paper order not changed", body: errorText(e), tone: "error" }))
        .finally(() => void refresh());
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      off();
      engine.setTradeLines([]);
    };
  }, [engine, symbol]);
}
