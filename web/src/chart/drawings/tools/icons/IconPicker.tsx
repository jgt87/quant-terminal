// Chooser shown when the Icon, Emoji or Sticker tool is picked (DrawingToolDef.picker): a grid of
// the built-in icons and / or the curated emoji. Clicking one places the tool with that choice;
// Esc or "Cancel" closes it. Styles: .icon-picker in styles/drawtools.css (theme tokens only).

import { useEffect } from "react";
import type { Drawing } from "@qt/core";
import { EMOJI_SET, ICON_SET } from "./iconKit";

export type PickerKind = "icon" | "emoji" | "sticker";

interface Props {
  kind: PickerKind;
  pick(patch: Partial<Drawing>): void;
  cancel(): void;
}

/** Props patch of a choice: the icon id, the emoji, or the sticker value ("icon:<id>" / "emoji:<char>"). */
export function pickerPatch(kind: PickerKind, value: string, from: "icon" | "emoji"): Partial<Drawing> {
  if (kind === "icon") return { props: { icon: value } };
  if (kind === "emoji") return { props: { emoji: value } };
  return { props: { sticker: `${from}:${value}` } };
}

export function IconPicker({ kind, pick, cancel }: Props) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [cancel]);
  const icons = kind !== "emoji";
  const emoji = kind !== "icon";
  return (
    <div className="icon-picker" data-picker={kind}>
      {icons && (
        <>
          <div className="flyout-header">Icons</div>
          <div className="icon-picker-grid" role="listbox" aria-label="Icons">
            {ICON_SET.map((i) => (
              <button key={i.id} className="icon-picker-cell" role="option" aria-selected={false} title={i.label} aria-label={i.label} data-pick={i.id} onClick={() => pick(pickerPatch(kind, i.id, "icon"))}>
                <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
                  <path d={i.d} fill={i.fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
      {emoji && (
        <>
          <div className="flyout-header">Emoji</div>
          <div className="icon-picker-grid" role="listbox" aria-label="Emoji">
            {EMOJI_SET.map((e) => (
              <button key={e} className="icon-picker-cell icon-picker-emoji" role="option" aria-selected={false} title={e} aria-label={e} data-pick={e} onClick={() => pick(pickerPatch(kind, e, "emoji"))}>
                {e}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="icon-picker-foot">
        <button className="icon-picker-cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
