// Shell of the tabbed settings windows: Dialog + Tabs + Defaults / Cancel / OK footer.
// Changes preview live in the caller; Cancel (and Esc / close) reverts, OK keeps them.

import { useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Tabs } from "./Tabs";
import "../styles/settings.css";

interface Props<T extends string> {
  title: string;
  tabs: { id: T; label: string }[];
  initialTab?: T;
  width?: number;
  onOk(): void;
  onCancel(): void;
  onDefaults?(): void;
  /** Extra control at the left of the footer (e.g. the drawing Template ▸ button). */
  footerLeft?: ReactNode;
  children(tab: T): ReactNode;
}

export function SettingsDialog<T extends string>({ title, tabs, initialTab, width = 440, onOk, onCancel, onDefaults, footerLeft, children }: Props<T>) {
  const [tab, setTab] = useState<T>(initialTab ?? tabs[0].id);
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width={width}
      footer={
        <>
          {footerLeft}
          {onDefaults && (
            <button className="btn ghost" onClick={onDefaults}>
              Defaults
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" data-action="cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" data-action="ok" onClick={onOk}>
            OK
          </button>
        </>
      }
    >
      <Tabs<T> tabs={tabs} value={tab} onChange={(id) => setTab(id)} label={`${title} sections`} />
      <form
        className="settings-body"
        role="tabpanel"
        aria-label={tabs.find((t) => t.id === tab)?.label}
        onSubmit={(e) => {
          e.preventDefault();
          onOk();
        }}
      >
        {children(tab)}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
