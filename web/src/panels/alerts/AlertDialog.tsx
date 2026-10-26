// Create/edit alert: symbol, interval, AND-ed conditions, trigger, expiry, message and notify
// options. Ctrl+Enter saves.

import { useEffect, useMemo, useState } from "react";
import { INTERVALS, type Alert, type Drawing, type Interval } from "@qt/core";
import { getLayout } from "../../api/client";
import { errorText } from "../../api/http";
import { Dialog } from "../../components/Dialog";
import { alertCapable, buildAlert, newCondition, type AlertDraft, type AlertJson } from "./alertModel";
import options from "./alertOptions.json";
import { ConditionEditor } from "./ConditionEditor";
import { NotifyFields } from "./NotifyFields";

interface Props {
  initial: AlertDraft;
  onSave(json: AlertJson, id?: string): Promise<Alert>;
  onClose(): void;
}

export function AlertDialog({ initial, onSave, onClose }: Props) {
  const [d, setD] = useState<AlertDraft>(initial);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AlertDraft>(k: K, v: AlertDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Alert-capable drawings of the chart layout for this symbol (drawing operands).
  useEffect(() => {
    if (!d.layoutId) return setDrawings([]);
    let alive = true;
    getLayout(d.layoutId)
      .then((l) => alive && setDrawings((l.drawings[d.symbol.trim()] ?? []).filter((x) => alertCapable(x.type))))
      .catch(() => alive && setDrawings([]));
    return () => {
      alive = false;
    };
  }, [d.layoutId, d.symbol]);

  const preview = useMemo(() => buildAlert(d), [d]);

  const submit = async () => {
    const { alert, errors: errs } = buildAlert(d);
    setErrors(errs);
    if (!alert) return;
    setBusy(true);
    try {
      await onSave(alert, d.id);
      onClose();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={d.id ? "Edit alert" : "Create alert"}
      onClose={onClose}
      width={660}
      footer={
        <>
          <span className="muted al-foot-hint">{preview.errors.length ? `${preview.errors.length} to fix` : "Ctrl+Enter to save"}</span>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>
            {d.id ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div
        className="al-form"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="al-line">
          <label>
            Symbol
            <input type="text" value={d.symbol} onChange={(e) => set("symbol", e.target.value)} aria-label="Symbol" autoFocus={!d.symbol} />
          </label>
          <label>
            Interval
            <select value={d.interval} onChange={(e) => set("interval", e.target.value as Interval)} aria-label="Interval">
              {INTERVALS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="grow">
            Name
            <input type="text" value={d.name} placeholder="(optional)" onChange={(e) => set("name", e.target.value)} aria-label="Alert name" />
          </label>
        </div>

        <div className="al-section-title">Conditions (all must hold)</div>
        {d.conditions.map((c, i) => (
          <ConditionEditor
            key={i}
            index={i}
            value={c}
            drawings={drawings}
            canRemove={d.conditions.length > 1}
            onChange={(next) => set("conditions", d.conditions.map((x, j) => (j === i ? next : x)))}
            onRemove={() => set("conditions", d.conditions.filter((_, j) => j !== i))}
          />
        ))}
        <button className="btn ghost al-add" onClick={() => set("conditions", [...d.conditions, newCondition()])} disabled={d.conditions.length >= 20}>
          + Add condition (AND)
        </button>

        <div className="al-line">
          <label>
            Trigger
            <select value={d.trigger} onChange={(e) => set("trigger", e.target.value as AlertDraft["trigger"])} aria-label="Trigger">
              {options.triggers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expires
            <input type="datetime-local" className="text-input" value={d.expires} onChange={(e) => set("expires", e.target.value)} aria-label="Expiry" />
          </label>
          <label className="al-check">
            <input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} />
            Active
          </label>
        </div>

        <label className="al-msg">
          Message
          <textarea rows={2} value={d.message} onChange={(e) => set("message", e.target.value)} aria-label="Message" />
          <span className="muted">
            Placeholders:{" "}
            {options.placeholders.map((p) => (
              <button key={p} type="button" className="al-chip" onClick={() => set("message", d.message + p)}>
                {p}
              </button>
            ))}
          </span>
        </label>

        <NotifyFields draft={d} onChange={(patch) => setD((x) => ({ ...x, ...patch }))} />

        {errors.length > 0 && (
          <ul className="al-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
