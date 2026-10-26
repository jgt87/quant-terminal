// Modal shell: backdrop click and Esc close; focus returns to the opener.

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import "../styles/dialog.css";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ title, onClose, children, footer, width = 480 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Parents usually pass a fresh onClose each render; keep it in a ref so re-renders never
  // re-run the focus effect (that used to pull focus out of the dialog's input).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An open popover inside the dialog (color picker) closes first.
        if (document.querySelector(".color-pop")) return;
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref} tabIndex={-1}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
