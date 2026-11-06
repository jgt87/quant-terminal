// Paper (simulated) accounts: list, selection and the selected account polled every 2 s while
// the panel is visible.

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "../api/client";
import { errorText } from "../api/http";
import {
  cancelPaperOrder, closePaperPosition, createPaper, deletePaper, getPaper, listPaper, placePaperOrder, resetPaper,
  type PaperAccountView, type PaperOrderRequest,
} from "../api/paper";
import { loadLocal, saveLocal } from "../panels/common/storage";

export const PAPER_POLL_MS = 2000;
export const PAPER_SELECTED_KEY = "qt.paper.selected";
const SELECTED_KEY = PAPER_SELECTED_KEY;

export function usePaper(visible: boolean) {
  const [accounts, setAccounts] = useState<PaperAccountView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadLocal<string | null>(SELECTED_KEY, null));
  const [account, setAccount] = useState<PaperAccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sid = (accounts.find((a) => a.id === selectedId) ?? accounts[0])?.id ?? null;
  const sidRef = useRef(sid);
  sidRef.current = sid;

  const reloadList = useCallback(async () => {
    try {
      setAccounts(await listPaper());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => void reloadList(), [reloadList]);

  useEffect(() => {
    if (!sid || !visible) return;
    const ctrl = new AbortController();
    let timer: number | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const a = await getPaper(sid, ctrl.signal);
          if (sidRef.current === sid) setAccount(a);
          setError(null);
        } catch (e) {
          if (isAbort(e)) return;
          setError(errorText(e));
        }
      }
      if (!ctrl.signal.aborted) timer = window.setTimeout(tick, PAPER_POLL_MS);
    };
    void tick();
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [sid, visible]);

  const select = (id: string) => {
    setSelectedId(id);
    saveLocal(SELECTED_KEY, id);
    setAccount(null);
  };

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
    accounts,
    account: account && account.id === sid ? account : null,
    error,
    select,
    create: (name: string, balance: number) =>
      act(async () => {
        const a = await createPaper({ name, balance });
        setAccounts((prev) => [...prev, a]);
        select(a.id);
      }),
    reset: async () => {
      if (sid) await act(async () => setAccount(await resetPaper(sid)));
    },
    remove: async () => {
      if (!sid) return;
      await act(async () => {
        await deletePaper(sid);
        setAccounts((prev) => prev.filter((a) => a.id !== sid));
        setAccount(null);
      });
    },
    place: (o: PaperOrderRequest) =>
      act(async () => {
        if (!sid) throw new Error("Create a paper account first");
        const r = await placePaperOrder(sid, o);
        setAccount(r.account);
        return r.order;
      }),
    cancel: async (orderId: string) => {
      if (sid) await act(async () => setAccount(await cancelAndReload(sid, orderId)));
    },
    close: async (symbol: string) => {
      if (sid) await act(async () => setAccount((await closePaperPosition(sid, symbol)).account));
    },
  };
}

async function cancelAndReload(id: string, orderId: string) {
  await cancelPaperOrder(id, orderId);
  return getPaper(id);
}

export type PaperApi = ReturnType<typeof usePaper>;
