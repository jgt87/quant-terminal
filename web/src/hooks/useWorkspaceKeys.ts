// Workspace keyboard shortcuts (see config/shortcuts.json and the "?" help dialog). Ignored
// while a text field has focus, while a dialog is open, or when the chart already handled the
// key (Alt+letter drawing tools).

import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutMatch } from "../state/shortcuts";

export function useWorkspaceKeys(enabled: boolean, run: (m: ShortcutMatch) => void): void {
  const cb = useRef(run);
  cb.current = run;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, select, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      const m = matchShortcut(e);
      if (!m) return;
      e.preventDefault();
      cb.current(m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
