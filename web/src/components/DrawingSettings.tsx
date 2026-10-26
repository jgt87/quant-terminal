// Drawing settings window, driven by the tool's settings schema: Inputs / Style / Text / custom
// tabs / Coordinates / Visibility. Every edit previews on the chart immediately; Cancel restores
// the drawing as it was. Footer: Template ▸ on the left, Defaults / Cancel / OK on the right.

import { useState } from "react";
import type { Drawing } from "@qt/core";
import { getTool, toolLabel } from "../chart/drawings/registry";
import type { SettingsField } from "../chart/drawings/types";
import type { ChartTheme } from "../chart/theme";
import { CoordinatesEditor } from "./drawing/CoordinatesEditor";
import { SchemaFields } from "./drawing/SchemaFields";
import { settingsTabs } from "./drawing/settingsTabs";
import { VisibilityRanges } from "./drawing/VisibilityRanges";
import { ContextMenu } from "./ContextMenu";
import { Icon } from "./icons";
import type { MenuItem } from "./menuTypes";
import { SettingsDialog } from "./SettingsDialog";
import { Check } from "./SettingsFields";

interface Props {
  /** The live drawing (re-read from the chart on every change). */
  drawing: Drawing;
  theme: ChartTheme;
  /** Called with every edit (live preview) and with the original on Cancel. */
  onChange(d: Drawing): void;
  onClose(): void;
  /** Items of the footer's Template ▸ menu. */
  templateMenu?(): MenuItem[];
}

export function DrawingSettings({ drawing: d, theme, onChange, onClose, templateMenu }: Props) {
  const [original] = useState(d);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const def = getTool(d.type);
  const schema = def?.settings ?? { style: [] };
  const tabs = settingsTabs(d.type);
  const fields = (tab: string): SettingsField[] =>
    tab === "inputs" ? (schema.inputs ?? []) : tab === "style" ? schema.style : tab === "text" ? (schema.text ?? []) : (schema.tabs?.find((t) => t.id === tab)?.fields ?? []);

  return (
    <SettingsDialog<string>
      title={`${def?.label ?? toolLabel(d.type)} settings`}
      tabs={tabs.length ? tabs : [{ id: "coordinates", label: "Coordinates" }]}
      width={460}
      onOk={onClose}
      onCancel={() => {
        onChange(original);
        onClose();
      }}
      onDefaults={() => {
        const next: Drawing = { ...d, visibility: undefined };
        if (def?.defaults && Object.keys(def.defaults).length) next.style = { ...def.defaults };
        else delete next.style;
        if (def?.defaultProps) next.props = { ...def.defaultProps };
        else delete next.props;
        delete next.visibility;
        onChange(next);
      }}
      footerLeft={
        templateMenu && (
          <>
            <button
              type="button"
              className="btn ghost dlg-template"
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ x: r.left, y: r.top });
              }}
            >
              Template <Icon name="chevronDown" size={12} />
            </button>
            {menu && <ContextMenu x={menu.x} y={menu.y} label="Template" items={templateMenu()} onClose={() => setMenu(null)} />}
          </>
        )
      }
    >
      {(tab) => {
        if (tab === "coordinates") return <CoordinatesEditor drawing={d} mode={schema.coordinates || "time-price"} onChange={onChange} />;
        if (tab === "visibility") return <VisibilityRanges value={d.visibility} onChange={(visibility) => onChange({ ...d, visibility })} />;
        return (
          <>
            <SchemaFields fields={fields(tab)} drawing={d} theme={theme} onChange={onChange} />
            {tab === "style" && <Check label="Locked" checked={Boolean(d.locked)} onChange={(locked) => onChange({ ...d, locked: locked || undefined })} />}
          </>
        );
      }}
    </SettingsDialog>
  );
}

export function label(d: Drawing): string {
  return toolLabel(d.type);
}
