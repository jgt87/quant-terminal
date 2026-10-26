// Object tree model (pure): the active chart's panes with their drawings (by user group) and
// indicators, filtered by a text query.

import type { Drawing, DrawingGroup } from "@qt/core";

export interface TreeDrawing {
  kind: "drawing";
  id: string;
  name: string;
  type: string;
  hidden: boolean;
  locked: boolean;
  selected: boolean;
}

export interface TreeGroup {
  kind: "group";
  id: string;
  name: string;
  items: TreeDrawing[];
  /** All members hidden / locked (group toggles). */
  hidden: boolean;
  locked: boolean;
}

export interface TreeIndicator {
  kind: "indicator";
  uid: string;
  name: string;
  hidden: boolean;
}

export interface TreePane {
  id: string;
  name: string;
  main: boolean;
  groups: TreeGroup[];
  drawings: TreeDrawing[];
  indicators: TreeIndicator[];
}

export interface TreeInput {
  symbol: string;
  panes: { id: string; main: boolean; uids: string[] }[];
  drawings: readonly Drawing[];
  groups: readonly DrawingGroup[];
  selected: readonly string[];
  indicators: { uid: string; name: string; visible: boolean }[];
  label(type: string): string;
}

const match = (q: string, ...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));

/** Builds the tree; with a filter, only matching items (and groups that match or hold matches). */
export function buildObjectTree(inp: TreeInput, filter = ""): TreePane[] {
  const q = filter.trim().toLowerCase();
  const ind = new Map(inp.indicators.map((i) => [i.uid, i]));
  const node = (d: Drawing): TreeDrawing => ({
    kind: "drawing",
    id: d.id,
    name: d.name || inp.label(d.type),
    type: d.type,
    hidden: Boolean(d.hidden),
    locked: Boolean(d.locked),
    selected: inp.selected.includes(d.id),
  });
  const groupIds = new Set(inp.groups.map((g) => g.id));
  // Newest drawings first, like a layer list (top of the list = drawn last).
  const all = [...inp.drawings].reverse();
  return inp.panes.map((p) => {
    const indicators: TreeIndicator[] = p.uids
      .map((u) => ind.get(u))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => ({ kind: "indicator" as const, uid: i.uid, name: i.name, hidden: !i.visible }))
      .filter((i) => match(q, i.name));
    if (!p.main) return { id: p.id, name: indicators[0]?.name ?? "Pane", main: false, groups: [], drawings: [], indicators };
    const groups: TreeGroup[] = inp.groups
      .map((g) => {
        const members = all.filter((d) => d.groupId === g.id).map(node);
        const items = match(q, g.name) ? members : members.filter((d) => match(q, d.name, d.type));
        return {
          kind: "group" as const,
          id: g.id,
          name: g.name,
          items,
          hidden: members.length > 0 && members.every((d) => d.hidden),
          locked: members.length > 0 && members.every((d) => d.locked),
        };
      })
      .filter((g) => !q || match(q, g.name) || g.items.length > 0);
    const drawings = all
      .filter((d) => !d.groupId || !groupIds.has(d.groupId))
      .map(node)
      .filter((d) => match(q, d.name, d.type));
    return { id: p.id, name: inp.symbol, main: true, groups, drawings, indicators };
  });
}
