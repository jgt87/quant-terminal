// Styled yes/no confirmation (replaces window.confirm, which blocks the page).

import { Dialog } from "./Dialog";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDialog({ title, message, confirmLabel = "OK", onConfirm, onClose }: Props) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={380}
      footer={
        <>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog-message">{message}</p>
    </Dialog>
  );
}
