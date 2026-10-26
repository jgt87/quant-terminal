// Notification options of an alert: desktop notification, sound (with preview), webhook URL.

import { useState } from "react";
import type { AlertDraft } from "./alertModel";
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from "./notify";
import { playSound, SOUND_IDS, SOUNDS } from "./sounds";

interface Props {
  draft: AlertDraft;
  onChange(patch: Partial<AlertDraft>): void;
}

export function NotifyFields({ draft, onChange }: Props) {
  const [perm, setPerm] = useState<NotifyPermission>(notifyPermission());
  return (
    <fieldset className="al-notify">
      <legend>Notify</legend>
      <label className="al-check">
        <input type="checkbox" checked={draft.browser} onChange={(e) => onChange({ browser: e.target.checked })} />
        In-app toast and desktop notification
      </label>
      {draft.browser && perm === "default" && (
        <button type="button" className="btn ghost" onClick={async () => setPerm(await requestNotifyPermission())}>
          Enable desktop notifications
        </button>
      )}
      {draft.browser && perm === "denied" && <span className="muted">Desktop notifications are blocked in this browser.</span>}
      <div className="al-line">
        <label>
          Sound
          <select value={draft.sound} onChange={(e) => onChange({ sound: e.target.value })} aria-label="Sound">
            <option value="">None</option>
            {SOUND_IDS.map((id) => (
              <option key={id} value={id}>
                {SOUNDS[id].label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn ghost" disabled={!draft.sound} onClick={() => playSound(draft.sound, true)}>
          Preview
        </button>
        <label className="grow">
          Webhook URL
          <input type="text" value={draft.webhookUrl} placeholder="https://… (optional, POST JSON)" onChange={(e) => onChange({ webhookUrl: e.target.value })} aria-label="Webhook URL" />
        </label>
      </div>
    </fieldset>
  );
}
