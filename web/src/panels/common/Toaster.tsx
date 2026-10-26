// Stacked toasts in the lower right corner. Click runs the toast action; × dismisses.

import { useEffect, useState } from "react";
import { Icon } from "../../components/icons";
import { dismissToast, subscribeToasts, type Toast } from "./toasts";

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setList), []);
  if (list.length === 0) return null;
  return (
    <div className="toaster" role="region" aria-label="Notifications" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone ?? "info"}${t.onClick ? " clickable" : ""}`}
          role="status"
          tabIndex={t.onClick ? 0 : -1}
          onClick={() => {
            t.onClick?.();
            dismissToast(t.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && t.onClick) {
              t.onClick();
              dismissToast(t.id);
            }
          }}
        >
          <div className="toast-text">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
          </div>
          <button
            className="icon-btn"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
