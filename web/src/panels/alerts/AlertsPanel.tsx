// Alerts panel: list and log tabs, new/edit/clone dialog, mute and desktop-notification switches.

import { useEffect, useState } from "react";
import type { Alert } from "@qt/core";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Tabs } from "../../components/Tabs";
import type { AlertCenter } from "../../hooks/alerts";
import { alertDialogRequests } from "../bus";
import { panelIcon } from "../panelIcons";
import { lastPriceOf, type PanelIntegration } from "../registry";
import { AlertDialog } from "./AlertDialog";
import { AlertList } from "./AlertList";
import { AlertLog } from "./AlertLog";
import { cloneDraft, draftFromAlert, newDraft, type AlertDraft } from "./alertModel";
import { notifyPermission, requestNotifyPermission } from "./notify";
import { isMuted, onMutedChange, setMuted } from "./sounds";
import "./alerts.css";

interface Props {
  center: AlertCenter;
  integration: PanelIntegration;
}

type Tab = "list" | "log";

export function AlertsPanel({ center, integration }: Props) {
  const [tab, setTab] = useState<Tab>("list");
  const [draft, setDraft] = useState<AlertDraft | null>(null);
  const [confirm, setConfirm] = useState<Alert | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [perm, setPerm] = useState(notifyPermission());
  useEffect(() => onMutedChange(setMutedState), []);
  // "Add alert on …" from the chart.
  useEffect(() => alertDialogRequests.on((d) => setDraft(d)), []);

  const newAlert = () => {
    const ctx = integration.getActiveChartContext();
    setDraft(newDraft(ctx?.symbol ?? integration.activeSymbol, ctx?.interval ?? "1D", lastPriceOf(ctx), ctx?.layoutId ?? ""));
  };

  const activeCount = center.alerts.filter((a) => a.active).length;
  return (
    <section className="pn al-panel" aria-label="Alerts">
      <header className="pn-head">
        <h3>Alerts</h3>
        <span className="muted">{activeCount} active</span>
        <span className="spacer" />
        <button className="icon-btn" title="New alert (N)" onClick={newAlert}>
          {panelIcon("plus", 16)}
        </button>
        <button className={`icon-btn${muted ? " on" : ""}`} title={muted ? "Sounds muted (click to unmute)" : "Mute alert sounds"} aria-pressed={muted} onClick={() => setMuted(!muted)}>
          {panelIcon(muted ? "mute" : "sound", 16)}
        </button>
        {perm === "default" && (
          <button className="icon-btn" title="Enable desktop notifications" onClick={async () => setPerm(await requestNotifyPermission())}>
            {panelIcon("bellRing", 16)}
          </button>
        )}
      </header>
      <div
        className="pn-tabs"
        onKeyDown={(e) => {
          if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target as HTMLElement).closest("input,select,textarea")) {
            e.preventDefault();
            newAlert();
          }
        }}
      >
        <Tabs<Tab>
          label="Alerts view"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "list", label: `Alerts (${center.alerts.length})` },
            { id: "log", label: center.unread ? `Log (${center.unread} new)` : "Log" },
          ]}
        />
      </div>
      <div className="pn-body">
        {tab === "list" ? (
          <AlertList
            alerts={center.alerts}
            errors={center.status?.errors ?? {}}
            onToggle={(a, on) => void center.setActive(a, on)}
            onEdit={(a) => setDraft(draftFromAlert(a))}
            onClone={(a) => setDraft(cloneDraft(a))}
            onDelete={setConfirm}
            onOpen={(a) => integration.onLoadSymbol(a.symbol)}
          />
        ) : (
          <AlertLog
            events={center.events}
            alerts={center.alerts}
            onOpen={(e) => {
              if (!e.seen) void center.markSeen([e.id]);
              integration.onLoadSymbol(e.symbol);
            }}
          />
        )}
      </div>
      <footer className="pn-foot">
        {tab === "log" ? (
          <>
            <button className="btn ghost" onClick={() => void center.markSeen()} disabled={!center.unread}>
              Mark all seen
            </button>
            <button className="btn ghost" onClick={() => void center.clearLog()} disabled={center.events.length === 0}>
              Clear
            </button>
          </>
        ) : (
          <span className="muted">
            {center.status ? (center.status.running ? "Evaluating" : "Evaluator stopped") : "…"}
            {center.status?.lastTickAt ? ` · last pass ${new Date(center.status.lastTickAt).toLocaleTimeString()}` : ""}
            {center.live ? "" : " · stream reconnecting"}
          </span>
        )}
        <span className="spacer" />
        {center.error && <span className="pn-error">{center.error}</span>}
      </footer>
      {draft && <AlertDialog initial={draft} onSave={center.save} onClose={() => setDraft(null)} />}
      {confirm && (
        <ConfirmDialog
          title="Delete alert"
          message={`Delete the alert "${confirm.name || confirm.symbol}"?`}
          confirmLabel="Delete"
          onConfirm={() => void center.remove(confirm.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
