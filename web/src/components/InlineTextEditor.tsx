// Inline text editor over the chart (tools with editText): a multi-line textarea at the text's
// place. Enter adds a line, Ctrl+Enter or a click outside commits, Esc cancels.
//
// The editor usually opens from a pointer press on the chart (creating a text drawing): the
// browser then moves focus to the chart after the press. Focus taken by the chart (or lost to
// nothing, e.g. another window) therefore returns to the editor; a press outside commits, and
// moving focus to another control (Tab) commits too.

import { useEffect, useRef } from "react";
import "../styles/inlinetext.css";

interface Props {
  left: number;
  top: number;
  width: number;
  height: number;
  value: string;
  multiline?: boolean;
  fontSize?: number;
  color?: string;
  onCommit(text: string): void;
  onCancel(): void;
}

export function InlineTextEditor(p: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const commitRef = useRef<() => void>(() => undefined);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    p.onCommit(ref.current?.value ?? p.value);
  };
  commitRef.current = commit;
  useEffect(() => {
    const el = ref.current;
    const focus = () => {
      if (done.current || !el || document.activeElement === el) return;
      el.focus();
      el.select();
    };
    focus();
    const t = setTimeout(focus, 0);
    // A press anywhere outside the editor commits it.
    const down = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) commitRef.current();
    };
    window.addEventListener("pointerdown", down, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", down, true);
    };
  }, []);
  return (
    <textarea
      ref={ref}
      className="inline-text-editor"
      aria-label="Edit text"
      defaultValue={p.value}
      rows={Math.max(1, p.value.split("\n").length)}
      style={{ left: p.left, top: p.top, minWidth: Math.max(80, p.width), minHeight: Math.max(24, p.height), fontSize: p.fontSize, color: p.color }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          p.onCancel();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !p.multiline)) {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={(e) => {
        if (done.current) return;
        const to = e.relatedTarget as HTMLElement | null;
        if (!to || to.closest(".chart-host")) {
          setTimeout(() => {
            if (!done.current) ref.current?.focus();
          }, 0);
          return;
        }
        commit();
      }}
    />
  );
}
