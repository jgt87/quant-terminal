// Textarea code editor with line numbers and a syntax-highlight overlay. Tab / Shift+Tab indent,
// Enter keeps the indentation, Ctrl+Enter runs, Ctrl+S saves. Esc then Tab leaves the editor.

import { useMemo, useRef } from "react";
import { tokenize } from "./highlight";

interface Props {
  value: string;
  onChange(v: string): void;
  onRun?(): void;
  onSave?(): void;
  errorLine?: number;
  label?: string;
}

const INDENT = "  ";

function insert(ta: HTMLTextAreaElement, text: string, start = ta.selectionStart, end = ta.selectionEnd) {
  ta.setSelectionRange(start, end);
  // execCommand keeps the browser's undo stack; fall back to setRangeText.
  if (!document.execCommand?.("insertText", false, text)) {
    ta.setRangeText(text, start, end, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function CodeEditor({ value, onChange, onRun, onSave, errorLine, label = "Script source" }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const escaped = useRef(false);
  const tokens = useMemo(() => tokenize(value), [value]);
  const lines = value.split("\n").length;

  const sync = () => {
    const t = ta.current;
    if (!t) return;
    if (pre.current) {
      pre.current.scrollTop = t.scrollTop;
      pre.current.scrollLeft = t.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = t.scrollTop;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget;
    if (e.key === "Escape") {
      escaped.current = true;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (e.key === "Tab") {
      if (escaped.current) {
        escaped.current = false;
        return;
      }
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = t;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      if (s === en && !e.shiftKey) return insert(t, INDENT);
      // Indent / outdent every selected line.
      const block = value.slice(lineStart, en);
      const next = e.shiftKey ? block.replace(/^ {1,2}/gm, "") : block.replace(/^/gm, INDENT);
      insert(t, next, lineStart, en);
      t.setSelectionRange(lineStart, lineStart + next.length);
      return;
    }
    escaped.current = false;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const s = t.selectionStart;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, s))?.[0] ?? "";
      const extra = /[{([]\s*$/.test(value.slice(lineStart, s)) ? INDENT : "";
      insert(t, "\n" + indent + extra);
    }
  };

  return (
    <div className="code-editor">
      <div className="code-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={i + 1 === errorLine ? "err" : ""}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-stack">
        <pre className="code-hl" ref={pre} aria-hidden="true">
          {tokens.map((tk, i) => (tk.type === "plain" ? tk.text : <span key={i} className={`tk-${tk.type}`}>{tk.text}</span>))}
          {"\n"}
        </pre>
        <textarea
          ref={ta}
          className="code-input"
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          wrap="off"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
