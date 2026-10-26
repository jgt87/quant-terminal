// Alert center: alerts, evaluation status, the event log and the live stream. Mounted once by
// the panel host so toasts, sounds and desktop notifications work while the panel is closed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, AlertEvent } from "@qt/core";
import {
  alertEvents, alertStatus, createAlert, deleteAlert, listAlerts, markEventsSeen, subscribeAlerts, updateAlert,
  type AlertFired, type AlertStatus,
} from "../api/alerts";
import { errorText } from "../api/http";
import { renderMessage, type AlertJson } from "../panels/alerts/alertModel";
import { showDesktopNotification } from "../panels/alerts/notify";
import { playSound } from "../panels/alerts/sounds";
import { loadLocal, saveLocal } from "../panels/common/storage";
import { pushToast } from "../panels/common/toasts";

const CLEARED_KEY = "qt.alerts.clearedBefore";
const STATUS_POLL_MS = 15_000;

export function eventText(e: AlertEvent, alert?: Alert): string {
  return renderMessage(e.message, { symbol: e.symbol, price: e.price, time: e.time, name: e.alertName ?? alert?.name, interval: alert?.interval });
}

export function useAlertCenter(onLoadSymbol: (symbol: string) => void, panelVisible: boolean) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [clearedBefore, setClearedBefore] = useState(() => loadLocal<number>(CLEARED_KEY, 0));
  const load = useRef(onLoadSymbol);
  load.current = onLoadSymbol;

  const refreshAlerts = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([listAlerts(), alertStatus()]);
      setAlerts(a);
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      setEvents(await alertEvents(undefined, 500));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refreshAlerts();
    void refreshEvents();
  }, [refreshAlerts, refreshEvents]);

  // Status (evaluation errors) while the panel is visible.
  useEffect(() => {
    if (!panelVisible) return;
    void refreshAlerts();
    const t = window.setInterval(() => void refreshAlerts(), STATUS_POLL_MS);
    return () => window.clearInterval(t);
  }, [panelVisible, refreshAlerts]);

  // Live stream: toast, sound, desktop notification; the log and alert states follow.
  useEffect(
    () =>
      subscribeAlerts((p: AlertFired) => {
        const { alert, event } = p;
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [...prev, event]));
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, ...alert } : a)));
        const title = alert.name || `${alert.symbol} alert`;
        const body = eventText(event, alert);
        const open = () => load.current(event.symbol);
        pushToast({ title, body, tone: "alert", onClick: open, ttl: 12_000 });
        if (alert.notify.sound) playSound(alert.notify.sound);
        if (alert.notify.browser) showDesktopNotification(title, body, event.id, open);
      }, setLive),
    [],
  );

  const visibleEvents = events.filter((e) => e.time > clearedBefore);
  const unread = visibleEvents.filter((e) => !e.seen).length;

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await fn();
      setError(null);
      return r;
    } catch (e) {
      setError(errorText(e));
      return undefined;
    }
  };

  const save = async (json: AlertJson, id?: string): Promise<Alert> => {
    const a = id ? await updateAlert(id, json) : await createAlert(json);
    setAlerts((prev) => (id ? prev.map((x) => (x.id === id ? a : x)) : [...prev, a]));
    return a;
  };

  const setActive = (a: Alert, active: boolean) =>
    run(async () => {
      const next = await updateAlert(a.id, { active });
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? next : x)));
    });

  const remove = (id: string) =>
    run(async () => {
      await deleteAlert(id);
      setAlerts((prev) => prev.filter((x) => x.id !== id));
    });

  const markSeen = (ids?: string[]) =>
    run(async () => {
      await markEventsSeen(ids ? { ids } : { all: true });
      setEvents((prev) => prev.map((e) => (!ids || ids.includes(e.id) ? { ...e, seen: true } : e)));
    });

  /** Hide the current log in this browser (the server keeps its history) and mark it seen. */
  const clearLog = async () => {
    const t = Date.now();
    setClearedBefore(t);
    saveLocal(CLEARED_KEY, t);
    await markSeen();
  };

  return { alerts, events: visibleEvents, status, error, live, unread, refreshAlerts, refreshEvents, save, setActive, remove, markSeen, clearLog };
}

export type AlertCenter = ReturnType<typeof useAlertCenter>;
