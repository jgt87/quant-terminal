// Right-side panel host: an always-visible icon rail (Watchlist, Alerts, Screener, Portfolio,
// Paper trading, Scripts, Object tree, Time and sales, Data table) and the open panel next to it (resizable by
// its left edge). Clicking the open panel's icon collapses it. Alt+Shift+1..9 open the panels. The alert center (live
// stream, toasts, sounds, desktop notifications) runs here, so it works while panels are closed.

import { useEffect, useRef, useState } from "react";
import { useAlertCenter } from "../hooks/alerts";
import { AlertsPanel } from "./alerts/AlertsPanel";
import { openPanelRequests } from "./bus";
import { loadLocal, saveLocal } from "./common/storage";
import { Toaster } from "./common/Toaster";
import { panelIcon } from "./panelIcons";
import { PaperPanel } from "./paper/PaperPanel";
import { PortfolioPanel } from "./portfolio/PortfolioPanel";
import { PANELS, panelDef, type PanelId, type PanelIntegration } from "./registry";
import { ScreenerPanel } from "./screener/ScreenerPanel";
import { ScriptsPanel } from "./scripts/ScriptsPanel";
import { ObjectTreePanel } from "./objects/ObjectTreePanel";
import { TapePanel } from "./tape/TapePanel";
import { DataTablePanel } from "./data/DataTablePanel";
import { WatchlistPlus } from "./watchlist/WatchlistPlus";
import "./panels.css";

interface Props {
  /** Whether the panel area is expanded (the rail is always shown). */
  open: boolean;
  onOpenChange(open: boolean): void;
  integration: PanelIntegration;
}

const ACTIVE_KEY = "qt.panels.active";
const WIDTH_KEY = "qt.panels.width";
const MIN_W = 240;
const MAX_W = 900;

export function PanelHost({ open, onOpenChange, integration }: Props) {
  const [activeId, setActiveId] = useState<PanelId>(() => {
    const v = loadLocal<PanelId>(ACTIVE_KEY, "watchlist");
    return PANELS.some((p) => p.id === v) ? v : "watchlist";
  });
  const [widths, setWidths] = useState<Partial<Record<PanelId, number>>>(() => loadLocal(WIDTH_KEY, {}));
  const integ = useRef(integration);
  integ.current = integration;
  const center = useAlertCenter((s) => integ.current.onLoadSymbol(s), open && activeId === "alerts");

  const show = (id: PanelId) => {
    setActiveId(id);
    saveLocal(ACTIVE_KEY, id);
    onOpenChange(true);
  };
  const toggle = (id: PanelId) => (open && id === activeId ? onOpenChange(false) : show(id));

  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => openPanelRequests.on((id) => showRef.current(id)), []);

  // Alt+Shift+1..9 open a panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      const m = /^Digit(\d)$/.exec(e.code);
      const p = m && PANELS.find((x) => x.key === m[1]);
      if (!p) return;
      e.preventDefault();
      showRef.current(p.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const width = Math.min(MAX_W, Math.max(MIN_W, widths[activeId] ?? panelDef(activeId).width));
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [activeId]: Math.min(MAX_W, Math.max(MIN_W, w0 + (x0 - ev.clientX))) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWidths((w) => {
        saveLocal(WIDTH_KEY, w);
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const visible = (id: PanelId) => open && activeId === id;
  return (
    <div className={`panel-host${open ? " open" : ""}`} data-panel={open ? activeId : ""}>
      {open && (
        <div className="panel-content" style={{ width }}>
          <div className="panel-resize" onPointerDown={startResize} title="Drag to resize" role="separator" aria-orientation="vertical" />
          {activeId === "watchlist" && <WatchlistPlus activeSymbol={integration.activeSymbol} onSelect={(s) => integration.onLoadSymbol(s)} />}
          {activeId === "alerts" && <AlertsPanel center={center} integration={integration} />}
          {activeId === "screener" && <ScreenerPanel integration={integration} />}
          {activeId === "portfolio" && <PortfolioPanel integration={integration} visible={visible("portfolio")} />}
          {activeId === "paper" && <PaperPanel integration={integration} visible={visible("paper")} />}
          {activeId === "scripts" && <ScriptsPanel integration={integration} />}
          {activeId === "objects" && <ObjectTreePanel chart={integration.activeChart ?? null} />}
          {activeId === "data" && <DataTablePanel chart={integration.activeChart ?? null} />}
          {activeId === "tape" && <TapePanel symbol={integration.activeSymbol} visible={visible("tape")} />}
        </div>
      )}
      <nav className="panel-rail" aria-label="Panels">
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={`rail-btn${visible(p.id) ? " active" : ""}`}
            title={`${p.label} (Alt+Shift+${p.key})`}
            aria-label={p.label}
            aria-pressed={visible(p.id)}
            data-panel-id={p.id}
            onClick={() => toggle(p.id)}
          >
            {panelIcon(p.icon, 20)}
            {p.id === "alerts" && center.unread > 0 && <span className="rail-badge">{center.unread > 99 ? "99+" : center.unread}</span>}
          </button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
