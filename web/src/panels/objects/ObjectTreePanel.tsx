// Object tree panel: every drawing and indicator of the active chart, per pane, with user groups
// (create, rename, drag drawings in/out), per item show/hide, lock, select, rename and delete,
// group-level show/hide/lock/delete, and a filter box.

import { useEffect, useState, type DragEvent } from "react";
import type { Drawing } from "@qt/core";
import { getTool, toolLabel } from "../../chart/drawings/registry";
import { Icon } from "../../components/icons";
import { createGroup, symbolGroups } from "../../state/drawingActions";
import type { ActiveChartHandles } from "../registry";
import { buildObjectTree, type TreeDrawing, type TreeGroup, type TreeIndicator } from "./objectTreeModel";
import "./objects.css";

interface Props {
  chart: ActiveChartHandles | null;
}

const DRAG_MIME = "application/x-qt-drawing";

export function ObjectTreePanel({ chart }: Props) {
  const [filter, setFilter] = useState("");
  const [, setVersion] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const engine = chart?.engine ?? null;

  useEffect(() => {
    if (!engine) return;
    const bump = () => setVersion((v) => v + 1);
    const offs = [engine.events.on("drawings", bump), engine.events.on("layout", bump), engine.drawings.events.on("selection", bump), engine.drawings.events.on("state", bump)];
    return () => offs.forEach((off) => off());
  }, [engine]);

  if (!chart || !engine) {
    return (
      <section className="pn objtree" aria-label="Object tree">
        <header className="pn-head">
          <h3>Object tree</h3>
        </header>
        <div className="pn-empty">No chart is active.</div>
      </section>
    );
  }

  const dc = engine.drawings;
  const { layout } = chart;
  const groups = symbolGroups(layout);
  const tree = buildObjectTree(
    {
      symbol: layout.symbol,
      panes: engine.paneInfos(),
      drawings: dc.drawings,
      groups,
      selected: dc.selectedIds,
      indicators: layout.indicators.map((i) => {
        const c = engine.indicators.get(i.uid);
        return { uid: i.uid, name: c?.def.shortName ?? c?.def.name ?? i.indicatorId, visible: i.visible };
      }),
      label: toolLabel,
    },
    filter,
  );

  const ids = (g: TreeGroup) => dc.drawings.filter((d) => d.groupId === g.id).map((d) => d.id);
  const setIndicator = (uid: string, fn: (v: boolean) => boolean) =>
    chart.update((l) => ({ ...l, indicators: l.indicators.map((i) => (i.uid === uid ? { ...i, visible: fn(i.visible) } : i)) }));
  const removeGroup = (g: TreeGroup) => {
    dc.remove(ids(g));
    chart.update((l) => ({ ...l, groups: (l.groups ?? []).filter((x) => x.id !== g.id) }));
  };
  const renameGroup = (id: string, name: string) => chart.update((l) => ({ ...l, groups: (l.groups ?? []).map((g) => (g.id === id ? { ...g, name } : g)) }));
  const moveInto = (drawingId: string, groupId: string | null) =>
    dc.update(drawingId, (d) => {
      const next: Drawing = { ...d };
      if (groupId) next.groupId = groupId;
      else delete next.groupId;
      return next;
    });
  const onDrop = (groupId: string | null) => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) moveInto(id, groupId);
  };
  const dropProps = (key: string, groupId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: onDrop(groupId),
  });
  const toggleCollapse = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const nameEditor = (initial: string, commit: (v: string) => void) => (
    <input
      className="objtree-rename"
      autoFocus
      defaultValue={initial}
      aria-label="Name"
      maxLength={120}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit((e.target as HTMLInputElement).value.trim());
        if (e.key === "Escape") setRenaming(null);
        e.stopPropagation();
      }}
      onBlur={(e) => commit(e.target.value.trim())}
    />
  );

  const drawingRow = (d: TreeDrawing, depth: number) => (
    <div
      key={d.id}
      className={`objtree-row${d.selected ? " selected" : ""}${d.hidden ? " dim" : ""}`}
      style={{ paddingLeft: 8 + depth * 16 }}
      role="treeitem"
      aria-selected={d.selected}
      data-drawing-id={d.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, d.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) dc.selectIds(d.selected ? dc.selectedIds.filter((x) => x !== d.id) : [...dc.selectedIds, d.id]);
        else dc.selectId(d.id);
      }}
      onDoubleClick={() => chart.openDrawingSettings(d.id)}
    >
      <span className="objtree-icon">
        <Icon name={getTool(d.type)?.icon ?? "pencil"} path={getTool(d.type)?.iconPath} size={16} />
      </span>
      {renaming === d.id ? (
        nameEditor(d.name, (v) => {
          dc.update(d.id, (k) => {
            const next = { ...k };
            if (v && v !== toolLabel(k.type)) next.name = v;
            else delete next.name;
            return next;
          });
          setRenaming(null);
        })
      ) : (
        <span className="objtree-name" title={d.name}>
          {d.name}
        </span>
      )}
      <span className="objtree-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Rename" aria-label={`Rename ${d.name}`} onClick={() => setRenaming(d.id)}>
          <Icon name="rename" size={14} />
        </button>
        <button className={`icon-btn${d.locked ? " on" : ""}`} title={d.locked ? "Unlock" : "Lock"} aria-label={`${d.locked ? "Unlock" : "Lock"} ${d.name}`} aria-pressed={d.locked} onClick={() => dc.update(d.id, (k) => ({ ...k, locked: !k.locked || undefined }))}>
          <Icon name={d.locked ? "lock" : "unlock"} size={14} />
        </button>
        <button className="icon-btn" title={d.hidden ? "Show" : "Hide"} aria-label={`${d.hidden ? "Show" : "Hide"} ${d.name}`} aria-pressed={d.hidden} onClick={() => dc.update(d.id, (k) => ({ ...k, hidden: !k.hidden || undefined }))}>
          <Icon name={d.hidden ? "eyeOff" : "eye"} size={14} />
        </button>
        <button className="icon-btn" title="Remove" aria-label={`Remove ${d.name}`} onClick={() => dc.remove(d.id)}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </div>
  );

  const groupNode = (g: TreeGroup) => {
    const open = !collapsed.has(g.id);
    const members = ids(g);
    return (
      <div key={g.id} className="objtree-group" role="group" aria-label={g.name} data-group-id={g.id}>
        <div className={`objtree-row group${dropTarget === g.id ? " drop" : ""}${g.hidden ? " dim" : ""}`} role="treeitem" aria-expanded={open} {...dropProps(g.id, g.id)} onClick={() => dc.selectIds(members)}>
          <button className="objtree-caret" aria-label={open ? "Collapse" : "Expand"} onClick={(e) => (e.stopPropagation(), toggleCollapse(g.id))}>
            <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
          </button>
          <span className="objtree-icon">
            <Icon name="folder" size={16} />
          </span>
          {renaming === g.id ? (
            nameEditor(g.name, (v) => {
              if (v) renameGroup(g.id, v);
              setRenaming(null);
            })
          ) : (
            <span className="objtree-name">
              {g.name} <span className="muted">({members.length})</span>
            </span>
          )}
          <span className="objtree-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn" title="Rename group" aria-label={`Rename group ${g.name}`} onClick={() => setRenaming(g.id)}>
              <Icon name="rename" size={14} />
            </button>
            <button className={`icon-btn${g.locked ? " on" : ""}`} title={g.locked ? "Unlock group" : "Lock group"} aria-label={`${g.locked ? "Unlock" : "Lock"} group ${g.name}`} disabled={!members.length} onClick={() => dc.updateMany(members, (k) => ({ ...k, locked: !g.locked || undefined }))}>
              <Icon name={g.locked ? "lock" : "unlock"} size={14} />
            </button>
            <button className="icon-btn" title={g.hidden ? "Show group" : "Hide group"} aria-label={`${g.hidden ? "Show" : "Hide"} group ${g.name}`} disabled={!members.length} onClick={() => dc.updateMany(members, (k) => ({ ...k, hidden: !g.hidden || undefined }))}>
              <Icon name={g.hidden ? "eyeOff" : "eye"} size={14} />
            </button>
            <button className="icon-btn" title="Remove group and its drawings" aria-label={`Remove group ${g.name}`} onClick={() => removeGroup(g)}>
              <Icon name="trash" size={14} />
            </button>
          </span>
        </div>
        {open && g.items.map((d) => drawingRow(d, 2))}
        {open && !g.items.length && <div className="objtree-hint" style={{ paddingLeft: 40 }}>Drag drawings here</div>}
      </div>
    );
  };

  const indicatorRow = (i: TreeIndicator) => (
    <div key={i.uid} className={`objtree-row${i.hidden ? " dim" : ""}`} style={{ paddingLeft: 24 }} role="treeitem" data-indicator-uid={i.uid} onDoubleClick={() => chart.openIndicatorSettings(i.uid)}>
      <span className="objtree-icon">
        <Icon name="indicatorLine" size={16} />
      </span>
      <span className="objtree-name">{i.name}</span>
      <span className="objtree-actions">
        <button className="icon-btn" title="Settings" aria-label={`Settings of ${i.name}`} onClick={() => chart.openIndicatorSettings(i.uid)}>
          <Icon name="settings" size={14} />
        </button>
        <button className="icon-btn" title={i.hidden ? "Show" : "Hide"} aria-label={`${i.hidden ? "Show" : "Hide"} ${i.name}`} onClick={() => setIndicator(i.uid, (v) => !v)}>
          <Icon name={i.hidden ? "eyeOff" : "eye"} size={14} />
        </button>
        <button className="icon-btn" title="Remove" aria-label={`Remove ${i.name}`} onClick={() => chart.update((l) => ({ ...l, indicators: l.indicators.filter((x) => x.uid !== i.uid) }))}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </div>
  );

  return (
    <section className="pn objtree" aria-label="Object tree">
      <header className="pn-head">
        <h3>Object tree</h3>
        <span className="spacer" />
        <button
          className="icon-btn"
          title="Create group (from the selection)"
          aria-label="Create group"
          onClick={() => {
            const sel = [...dc.selectedIds];
            const id = createGroup({ engine, layout, update: chart.update, openDrawingSettings: chart.openDrawingSettings });
            if (sel.length) dc.updateMany(sel, (d) => ({ ...d, groupId: id }));
          }}
        >
          <Icon name="folderPlus" size={16} />
        </button>
      </header>
      <div className="objtree-filter">
        <input type="search" placeholder="Filter" aria-label="Filter objects" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="pn-body" role="tree" aria-label="Chart objects">
        {tree.map((p) => (
          <div key={p.id} className="objtree-pane" data-pane-id={p.id}>
            <div className={`objtree-pane-head${dropTarget === p.id ? " drop" : ""}`} {...(p.main ? dropProps(p.id, null) : {})}>
              <Icon name="pane" size={14} />
              <span>{p.main ? `Main pane · ${p.name}` : p.name}</span>
            </div>
            {p.groups.map(groupNode)}
            {p.drawings.map((d) => drawingRow(d, 1))}
            {p.indicators.map(indicatorRow)}
            {p.main && !p.groups.length && !p.drawings.length && !p.indicators.length && <div className="objtree-hint">{filter ? "Nothing matches the filter" : "No drawings or indicators"}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
