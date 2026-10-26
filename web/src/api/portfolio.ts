// Portfolios REST API.

import type { Holding, Portfolio, PortfolioTransaction } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export interface PortfolioTotals {
  costBasis: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  cash: number;
  equity: number;
  dayChange: number;
  fees: number;
  missingQuotes: string[];
}

export interface HoldingsResponse {
  portfolioId: string;
  currency: string;
  asOf: number;
  holdings: Holding[];
  totals: PortfolioTotals;
}

export type NewTransaction = Omit<PortfolioTransaction, "id"> & { id?: string };

const base = (id: string) => `/api/portfolios/${encodeURIComponent(id)}`;

export const listPortfolios = () => requestJson<Portfolio[]>("/api/portfolios");
export const createPortfolio = (p: { name: string; currency?: string; cash?: number }) => requestJson<Portfolio>("/api/portfolios", jsonBody("POST", p));
export const updatePortfolio = (id: string, patch: Partial<Omit<Portfolio, "id">>) => requestJson<Portfolio>(base(id), jsonBody("PUT", patch));
export const deletePortfolio = (id: string) => requestJson<{ ok: true }>(base(id), { method: "DELETE" });
export const addTransactions = (id: string, txs: NewTransaction | NewTransaction[]) => requestJson<Portfolio>(`${base(id)}/transactions`, jsonBody("POST", txs));
export const deleteTransaction = (id: string, txId: string) =>
  requestJson<Portfolio>(`${base(id)}/transactions/${encodeURIComponent(txId)}`, { method: "DELETE" });
export const getHoldings = (id: string) => requestJson<HoldingsResponse>(`${base(id)}/holdings`);
