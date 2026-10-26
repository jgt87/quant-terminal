// Tabs of a tool's settings window in display order (pure, from the tool's settings schema).

import { getTool } from "../../chart/drawings/registry";

export interface TabDef {
  id: string;
  label: string;
}

export function settingsTabs(type: string): TabDef[] {
  const s = getTool(type)?.settings ?? { style: [] };
  const all: Record<string, TabDef | null> = {
    inputs: s.inputs?.length ? { id: "inputs", label: "Inputs" } : null,
    style: s.style.length ? { id: "style", label: "Style" } : null,
    text: s.text?.length ? { id: "text", label: "Text" } : null,
    coordinates: s.coordinates === false ? null : { id: "coordinates", label: "Coordinates" },
    visibility: s.visibility === false ? null : { id: "visibility", label: "Visibility" },
  };
  for (const t of s.tabs ?? []) all[t.id] = { id: t.id, label: t.label };
  const order = s.tabOrder ?? ["inputs", "style", "text", ...(s.tabs ?? []).map((t) => t.id), "coordinates", "visibility"];
  return order.map((id) => all[id]).filter((t): t is TabDef => Boolean(t));
}
