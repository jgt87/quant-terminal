// Paper (simulated) trading REST API. Nothing here ever reaches a broker.

import type { PaperAccount, PaperOrder, PaperOrderType } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export interface PaperOrderView extends PaperOrder {
  parentId?: string;
  role?: "stop-loss" | "take-profit" | "close";
  commission?: number;
  realizedPnl?: number;
  cancelReason?: string;
}

export interface MarkedPosition {
  qty: number;
  avgPrice: number;
  last?: number | null;
  marketValue?: number | null;
  unrealizedPnl?: number | null;
}

/** Account as listed (raw) or fetched (marked to market: positions carry last/unrealized). */
export interface PaperAccountView extends Omit<PaperAccount, "positions" | "orders"> {
  name: string;
  initialBalance: number;
  createdAt: number;
  realizedPnl: number;
  totalCommission: number;
  orders: PaperOrderView[];
  positions: Record<string, MarkedPosition>;
  unrealizedPnl?: number;
  equity?: number;
  missingQuotes?: string[];
}

export interface PaperOrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: PaperOrderType;
  qty: number;
  price?: number;
  /** Stop-limit trigger price. */
  stopPrice?: number;
  /** Trailing stop: the trail as a price distance or as a percent (one of the two). */
  trailAmount?: number;
  trailPercent?: number;
  stopLoss?: number;
  takeProfit?: number;
}

/** Change a working order (null removes a bracket leg). */
export interface PaperOrderPatch {
  price?: number;
  stopPrice?: number;
  qty?: number;
  trailAmount?: number;
  trailPercent?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

const base = (id: string) => `/api/paper/${encodeURIComponent(id)}`;

export const listPaper = () => requestJson<PaperAccountView[]>("/api/paper");
export const createPaper = (body: { name?: string; currency?: string; balance?: number; commissionBps?: number; slippageBps?: number }) =>
  requestJson<PaperAccountView>("/api/paper", jsonBody("POST", body));
export const getPaper = (id: string, signal?: AbortSignal) => requestJson<PaperAccountView>(base(id), { signal });
export const deletePaper = (id: string) => requestJson<{ ok: true }>(base(id), { method: "DELETE" });
export const resetPaper = (id: string) => requestJson<PaperAccountView>(`${base(id)}/reset`, { method: "POST" });
export const placePaperOrder = (id: string, o: PaperOrderRequest) =>
  requestJson<{ order: PaperOrderView; account: PaperAccountView }>(`${base(id)}/orders`, jsonBody("POST", o));
export const modifyPaperOrder = (id: string, orderId: string, patch: PaperOrderPatch) =>
  requestJson<{ order: PaperOrderView; account: PaperAccountView }>(`${base(id)}/orders/${encodeURIComponent(orderId)}`, jsonBody("PUT", patch));
export const cancelPaperOrder = (id: string, orderId: string) =>
  requestJson<PaperOrderView>(`${base(id)}/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
export const closePaperPosition = (id: string, symbol: string) =>
  requestJson<{ order: PaperOrderView; account: PaperAccountView }>(`${base(id)}/close/${encodeURIComponent(symbol)}`, { method: "POST" });
