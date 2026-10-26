// Portfolios: list, selection, holdings (refreshed with quotes) and mutations.

import { useCallback, useEffect, useState } from "react";
import type { Portfolio } from "@qt/core";
import { errorText } from "../api/http";
import {
  addTransactions, createPortfolio, deletePortfolio, deleteTransaction, getHoldings, listPortfolios, updatePortfolio,
  type HoldingsResponse, type NewTransaction,
} from "../api/portfolio";
import { loadLocal, saveLocal } from "../panels/common/storage";

const SELECTED_KEY = "qt.portfolio.selected";
const HOLDINGS_POLL_MS = 30_000;

export function usePortfolios(visible: boolean) {
  const [list, setList] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadLocal<string | null>(SELECTED_KEY, null));
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = list.find((p) => p.id === selectedId) ?? list[0] ?? null;

  const reload = useCallback(async () => {
    try {
      setList(await listPortfolios());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const refreshHoldings = useCallback(async (id: string) => {
    try {
      setHoldings(await getHoldings(id));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const sid = selected?.id;
  const txCount = selected?.transactions.length ?? 0;
  useEffect(() => {
    if (!sid || !visible) return;
    void refreshHoldings(sid);
    const t = window.setInterval(() => void refreshHoldings(sid), HOLDINGS_POLL_MS);
    return () => window.clearInterval(t);
  }, [sid, txCount, visible, refreshHoldings]);

  const select = (id: string) => {
    setSelectedId(id);
    saveLocal(SELECTED_KEY, id);
    setHoldings(null);
  };

  const replace = (p: Portfolio) => setList((prev) => prev.map((x) => (x.id === p.id ? p : x)));

  /** Run a mutation; errors land in `error` and are rethrown for forms that show them inline. */
  const act = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      const r = await fn();
      setError(null);
      return r;
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  };

  return {
    list,
    selected,
    holdings: holdings && holdings.portfolioId === sid ? holdings : null,
    error,
    select,
    reload,
    create: (name: string, currency: string, cash: number) =>
      act(async () => {
        const p = await createPortfolio({ name, currency, cash });
        setList((prev) => [...prev, p]);
        select(p.id);
        return p;
      }),
    rename: (id: string, patch: { name?: string; currency?: string; cash?: number }) => act(async () => replace(await updatePortfolio(id, patch))),
    remove: (id: string) =>
      act(async () => {
        await deletePortfolio(id);
        setList((prev) => prev.filter((x) => x.id !== id));
      }),
    addTx: (id: string, txs: NewTransaction | NewTransaction[]) => act(async () => replace(await addTransactions(id, txs))),
    removeTx: (id: string, txId: string) => act(async () => replace(await deleteTransaction(id, txId))),
    refreshHoldings: () => sid && refreshHoldings(sid),
  };
}

export type PortfoliosApi = ReturnType<typeof usePortfolios>;
