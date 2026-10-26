// Glue between the drawing menus / floating toolbar / object tree and one chart: builds the
// menu state and the actions (engine edits, layout groups, templates, alerts, prompts).

import { applyTemplate, intervalUnit, visibilityPreset, type Drawing, type DrawingGroup, type Layout } from "@qt/core";
import type { ChartEngine } from "../chart/ChartEngine";
import { getTool } from "../chart/drawings/registry";
import { resetDefault, saveAsDefault, saveAsTemplate, templates } from "../chart/drawings/templateStore";
import { copyDrawings } from "../chart/drawings/clipboard";
import { createAlertFromChart } from "../panels/alerts/createFromChart";
import { openPanelRequests } from "../panels/bus";
import type { DrawingMenuActions, DrawingMenuState } from "./drawingMenu";
import { uid } from "./layoutDefaults";
import { requestPrompt } from "./promptBus";

export interface DrawingGlue {
  engine: ChartEngine;
  layout: Layout;
  update(fn: (l: Layout) => Layout): void;
  openDrawingSettings(id: string): void;
}

/** Groups of the layout's current symbol. */
export function symbolGroups(l: Layout): DrawingGroup[] {
  return (l.groups ?? []).filter((g) => g.symbol === l.symbol);
}

export function drawingMenuState(g: DrawingGlue): DrawingMenuState {
  return {
    groups: symbolGroups(g.layout),
    templates: templates(),
    unit: intervalUnit(g.engine.meta.intervalSec),
    drawings: g.engine.drawings.drawings,
    geom: g.engine.drawings.geom(),
  };
}

/** Next free "Group N" name. */
export function nextGroupName(groups: DrawingGroup[]): string {
  let n = groups.length + 1;
  while (groups.some((g) => g.name === `Group ${n}`)) n++;
  return `Group ${n}`;
}

/** Creates a group for the layout's symbol and returns its id. */
export function createGroup(g: DrawingGlue, name?: string): string {
  const id = uid("g");
  const symbol = g.layout.symbol;
  g.update((l) => ({ ...l, groups: [...(l.groups ?? []), { id, name: name ?? nextGroupName(symbolGroups(l)), symbol }] }));
  return id;
}

export function drawingActions(g: DrawingGlue): DrawingMenuActions {
  const dc = g.engine.drawings;
  const toolDefaults = (d: Drawing) => {
    const def = getTool(d.type);
    return { style: def?.defaults ?? {}, props: def?.defaultProps };
  };
  return {
    settings: (id) => g.openDrawingSettings(id),
    alert: (id) => {
      const d = dc.drawings.find((k) => k.id === id);
      if (d) createAlertFromChart(g.layout.symbol, g.layout.interval, { drawingId: d.id, layoutId: g.layout.id, type: d.type });
    },
    clone: (ids) => dc.clone(ids),
    copy: (ids) => copyDrawings(dc.drawings.filter((d) => ids.includes(d.id))),
    order: (ids, where) => dc.reorder(ids, where),
    setLocked: (ids, locked) => dc.updateMany(ids, (d) => ({ ...d, locked: locked || undefined })),
    setHidden: (ids, hidden) => dc.updateMany(ids, (d) => ({ ...d, hidden: hidden || undefined })),
    objectTree: () => openPanelRequests.emit("objects"),
    remove: (ids) => dc.remove(ids),
    visibility: (ids, preset) => {
      const vis = visibilityPreset(preset, intervalUnit(g.engine.meta.intervalSec));
      dc.updateMany(ids, (d) => {
        const next = { ...d, visibility: vis };
        if (!vis) delete next.visibility;
        return next;
      });
    },
    groupNew: (ids) => {
      const id = createGroup(g);
      dc.updateMany(ids, (d) => ({ ...d, groupId: id }));
    },
    groupAdd: (ids, groupId) => dc.updateMany(ids, (d) => ({ ...d, groupId })),
    groupRemove: (ids) =>
      dc.updateMany(ids, (d) => {
        const next = { ...d };
        delete next.groupId;
        return next;
      }),
    update: (id, fn) => dc.update(id, fn),
    template: {
      saveAs: (d) =>
        requestPrompt({
          title: "Save drawing template",
          label: "Template name",
          initial: d.templateName ?? "",
          onSubmit: (name) => {
            void saveAsTemplate(d, name);
            dc.update(d.id, (k) => ({ ...k, templateName: name }));
          },
        }),
      saveDefault: (d) => void saveAsDefault(d),
      applyDefault: (d) => {
        const def = templates()[d.type]?.default;
        dc.update(d.id, (k) => applyTemplate(k, def ? { style: def.style, props: def.props } : toolDefaults(k)));
      },
      apply: (d, t) => dc.update(d.id, (k) => applyTemplate(k, t)),
      reset: (d) => {
        dc.update(d.id, (k) => applyTemplate(k, toolDefaults(k)));
        void resetDefault(d.type);
      },
    },
  };
}
