// Small single-line text dialog (text-note drawings, naming watchlists, ...).

import { useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
  initial: string;
  title?: string;
  label?: string;
  /** Used when the field is left empty; with `required` an empty field cannot be submitted. */
  fallback?: string;
  required?: boolean;
  maxLength?: number;
  onSubmit(text: string): void;
  onClose(): void;
}

export function TextPrompt({ initial, title = "Text note", label, fallback = "Text", required = false, maxLength = 120, onSubmit, onClose }: Props) {
  const [text, setText] = useState(initial);
  const empty = !text.trim();
  const submit = () => {
    if (required && empty) return;
    onSubmit(text.trim() || fallback);
    onClose();
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={360}
      footer={
        <>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={required && empty}>
            OK
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="text-input"
          autoFocus
          aria-label={label ?? title}
          value={text}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
