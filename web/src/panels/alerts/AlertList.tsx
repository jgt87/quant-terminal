// Alert list: active toggle, edit, clone, delete and the evaluator's error per alert.
// Keys on a focused row: Enter edit, Space toggle, Delete remove, C clone.

import type { Alert } from "@qt/core";
import { Icon } from "../../components/icons";
import { panelIcon } from "../panelIcons";
import { describeCondition, formatAlertTime } from "./alertModel";

interface Props {
  alerts: Alert[];
  errors: Record<string, string>;
  onToggle(a: Alert, active: boolean): void;
  onEdit(a: Alert): void;
  onClone(a: Alert): void;
  onDelete(a: Alert): void;
  onOpen(a: Alert): void;
}

export function AlertList({ alerts, errors, onToggle, onEdit, onClone, onDelete, onOpen }: Props) {
  if (alerts.length === 0) return <div className="pn-empty">No alerts yet. Use + to create one, or right-click a price on the chart.</div>;
  return (
    <ul className="al-list" aria-label="Alerts">
      {alerts.map((a) => {
        const err = errors[a.id];
        const expired = a.expiresAt !== undefined && a.expiresAt <= Date.now();
        return (
          <li
            key={a.id}
            className={`al-item${a.active ? "" : " off"}${err ? " err" : ""}`}
            tabIndex={0}
            data-alert-id={a.id}
            onDoubleClick={() => onEdit(a)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter") onEdit(a);
              else if (e.key === " ") {
                e.preventDefault();
                onToggle(a, !a.active);
              } else if (e.key === "Delete") onDelete(a);
              else if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                onClone(a);
              }
            }}
          >
            <input type="checkbox" checked={a.active} onChange={(e) => onToggle(a, e.target.checked)} title={a.active ? "Active (click to stop)" : "Stopped (click to activate)"} aria-label="Active" />
            <div className="al-item-main" onClick={() => onOpen(a)}>
              <div className="al-item-head">
                <span className="al-sym">{a.symbol}</span>
                <span className="al-iv">{a.interval}</span>
                <span className="al-name">{a.name}</span>
              </div>
              <div className="al-item-cond">{a.conditions.map(describeCondition).join(" AND ")}</div>
              <div className="al-item-meta muted">
                {a.trigger}
                {a.lastFiredAt ? ` · fired ${formatAlertTime(a.lastFiredAt)}` : ""}
                {a.expiresAt ? ` · ${expired ? "expired" : "expires"} ${formatAlertTime(a.expiresAt)}` : ""}
              </div>
              {err && <div className="al-item-err">{err}</div>}
            </div>
            <div className="al-item-actions">
              <button className="icon-btn" title="Edit (Enter)" onClick={() => onEdit(a)}>
                <Icon name="settings" size={14} />
              </button>
              <button className="icon-btn" title="Clone (C)" onClick={() => onClone(a)}>
                <Icon name="copy" size={14} />
              </button>
              <button className="icon-btn" title="Delete (Del)" onClick={() => onDelete(a)}>
                {panelIcon("trash", 14)}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
