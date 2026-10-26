// Close a popover on an outside pointer press or Escape.

import { useEffect, type RefObject } from "react";

export function useDismiss(open: boolean, refs: RefObject<HTMLElement>[], onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}
