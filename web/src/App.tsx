// Application shell: toolbar, workspace tabs, the chart grid of the active tab, watchlist and
// backtest panels, dialogs, context menus and theme. Toolbar, drawing tools, dialogs and the
// backtest panel act on the active chart cell; each cell autosaves its own layout.

import { useCallback, useEffect, useState } from "react";
import type { ChartType, IndicatorInstance, Interval } from "@qt/core";
import type { Tool } from "./chart/drawings/DrawingController";
import { chartTheme, type ThemeMode } from "./chart/theme";
import { BacktestPanel } from "./components/backtest/BacktestPanel";
import { ChartSettings } from "./components/ChartSettings";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ContextMenu } from "./components/ContextMenu";
import { DrawingSettings } from "./components/DrawingSettings";
import { DrawingToolbar } from "./components/DrawingToolbar";
import { IndicatorDialog } from "./components/IndicatorDialog";
import { IndicatorSettings } from "./components/IndicatorSettings";
import type { MenuItem } from "./components/menuTypes";
import { SymbolSearch } from "./components/SymbolSearch";
import { TextPrompt } from "./components/TextPrompt";
import { TopToolbar } from "./components/TopToolbar";
import { ChartGrid } from "./components/workspace/ChartGrid";
import { ShortcutsDialog } from "./components/workspace/ShortcutsDialog";
import { TabStrip } from "./components/workspace/TabStrip";
import settings from "./config/settings.json";
import { useUrlSync } from "./hooks/useUrlSync";
import { useWorkspace } from "./hooks/useWorkspace";
import { useWorkspaceKeys } from "./hooks/useWorkspaceKeys";
import { useWorkspaceShell } from "./hooks/useWorkspaceShell";
import { newIndicator } from "./state/layoutDefaults";
import { usePref } from "./state/prefs";
import type { ShortcutMatch } from "./state/shortcuts";
import { ThemeContext } from "./state/theme";
import { activeCellOf, activeTabOf } from "./state/workspace";
import { intervalFields } from "./data/intervalSpec";
import { openPanelRequests, PanelHost, type PanelIntegration } from "./panels";
import { PromptHost } from "./components/PromptHost";
import { drawingActions, drawingMenuState } from "./state/drawingActions";
import { dialogTemplateMenu } from "./state/drawingMenu";
import "./styles/app.css";
import "./styles/workspace.css";

export function App() {
  const wsApi = useWorkspace();
  const { ws, dispatch } = wsApi;
  const [theme, setTheme] = usePref<ThemeMode>("theme", "dark");
  const [showVolume, setShowVolume] = usePref("volume", settings.showVolume);
  const [watchlistOpen, setWatchlistOpen] = usePref("watchlist", true);
  const [backtestOpen, setBacktestOpen] = usePref("backtest", false);
  const [search, setSearch] = useState<string | null>(null);
  const [compareSearch, setCompareSearch] = useState(false);
  const [indicatorPicker, setIndicatorPicker] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [drawingEdit, setDrawingEdit] = useState<string | null>(null);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const [textEdit, setTextEdit] = useState<{ id: string; text: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const shell = useWorkspaceShell(wsApi, {
    openMenu: (x, y, items) => setMenu({ x, y, items }),
    openSearch: (ch) => setSearch((s) => (s ?? "") + ch),
    openText: (id, text) => setTextEdit({ id, text }),
    openDrawingSettings: setDrawingEdit,
    openIndicatorSettings: setEditing,
    openChartSettings: () => setChartSettingsOpen(true),
    confirmCloseLast: setConfirmClose,
  });
  const { active, linkedUpdate } = shell;
  const urlReady = useUrlSync(wsApi, active, linkedUpdate);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // No browser context menu anywhere in the app (text fields keep theirs for copy/paste).
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  const layout = active?.layout ?? null;
  const update = active?.update;
  const engine = active?.engine ?? null;
  const setIndicators = (fn: (list: IndicatorInstance[]) => IndicatorInstance[]) => update?.((l) => ({ ...l, indicators: fn(l.indicators) }));
  const setSymbol = useCallback(
    (s: string) => {
      if (active) linkedUpdate(active.index, (l) => (l.symbol === s ? l : { ...l, symbol: s }));
    },
    [active, linkedUpdate],
  );

  // Typing a letter anywhere outside a text field opens symbol search (the chart handles its own keys).
  const dialogOpen =
    search !== null ||
    compareSearch ||
    indicatorPicker ||
    editing !== null ||
    textEdit !== null ||
    drawingEdit !== null ||
    chartSettingsOpen ||
    menu !== null ||
    shortcutsOpen ||
    confirmClose !== null;
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, select, textarea, [contenteditable], [role=menu]") || t.closest(".chart-host"))) return;
      if (e.key.length === 1 && /[a-z0-9^]/i.test(e.key)) {
        e.preventDefault();
        setSearch((s) => (s ?? "") + e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  const tab = ws ? activeTabOf(ws) : null;
  useWorkspaceKeys(!dialogOpen && !!ws, (m: ShortcutMatch) => {
    if (!ws || !tab) return;
    switch (m.id) {
      case "newTab":
        return shell.newTab();
      case "closeTab":
        return shell.closeTab(tab.id);
      case "reopenTab":
        return dispatch({ type: "reopen" });
      case "duplicateTab":
        return void shell.duplicateTab(tab.id);
      case "nextTab":
        return dispatch({ type: "cycle", dir: 1 });
      case "prevTab":
        return dispatch({ type: "cycle", dir: -1 });
      case "goToTab":
        return dispatch({ type: "selectIndex", index: (m.arg ?? 1) - 1 });
      case "maximizeCell":
        return shell.toggleMaximize(activeCellOf(tab));
      case "help":
        return setShortcutsOpen(true);
    }
  });

  if (!ws || !tab || !urlReady) {
    return <div className="boot">Loading workspace…</div>;
  }

  const symbol = layout?.symbol ?? "";
  const editingIndex = layout ? layout.indicators.findIndex((i) => i.uid === editing) : -1;
  const editingInstance = layout && editingIndex >= 0 ? layout.indicators[editingIndex] : undefined;
  const editDrawing = drawingEdit ? engine?.drawings.drawings.find((d) => d.id === drawingEdit) : undefined;
  const ctheme = chartTheme(theme, layout?.chartSettings);
  const tool: Tool = active?.tool ?? "cursor";
  const panelIntegration: PanelIntegration = {
    activeSymbol: symbol,
    // Loads into the active cell and its link group (same as the watchlist did).
    onLoadSymbol: setSymbol,
    getActiveChartContext: () =>
      layout ? { symbol: layout.symbol, interval: layout.interval, layoutId: layout.id, bars: engine?.data.bars ?? [] } : null,
    onAddScriptPlots: (r) => engine?.setScriptPlots(r.plots ?? null, r.outputs ?? {}),
    activeChart: engine && layout && update ? { engine, layout, update, openDrawingSettings: setDrawingEdit, openIndicatorSettings: setEditing } : null,
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className={`app${watchlistOpen ? " with-watchlist" : ""}${backtestOpen ? " with-backtest" : ""}`}>
        <TopToolbar
          symbol={symbol}
          interval={layout?.interval ?? "1D"}
          customInterval={layout?.customInterval}
          onCustomInterval={(text) => {
            const f = intervalFields(text);
            if (f) update?.((l) => ({ ...l, ...f }));
          }}
          onCompare={() => setCompareSearch(true)}
          onReplay={() => engine?.replayDispatch(engine.replay.phase === "off" ? { type: "arm" } : { type: "exit" })}
          replayActive={engine ? engine.replay.phase !== "off" : false}
          chartType={layout?.chartType ?? "candles"}
          logScale={layout?.logScale ?? false}
          showVolume={showVolume}
          watchlistOpen={watchlistOpen}
          backtestOpen={backtestOpen}
          theme={theme}
          onSymbolClick={() => setSearch("")}
          onInterval={(i: Interval) => update?.((l) => ({ ...l, interval: i, customInterval: undefined }))}
          onChartType={(t: ChartType) => update?.((l) => ({ ...l, chartType: t }))}
          onLog={(v) => update?.((l) => ({ ...l, logScale: v }))}
          onVolume={setShowVolume}
          onIndicators={() => setIndicatorPicker(true)}
          onResetView={() => engine?.resetView()}
          onChartSettings={() => setChartSettingsOpen(true)}
          onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onToggleWatchlist={() => setWatchlistOpen(!watchlistOpen)}
          onToggleBacktest={() => setBacktestOpen(!backtestOpen)}
          grid={tab.grid}
          onGrid={shell.setGrid}
          crosshairSync={ws.crosshairSync}
          onCrosshairSync={(on) => dispatch({ type: "crosshairSync", on })}
        />
        <TabStrip
          tabs={ws.tabs}
          activeId={ws.activeTab}
          canReopen={wsApi.closedCount > 0}
          onSelect={(id) => dispatch({ type: "select", tabId: id })}
          onNew={shell.newTab}
          onClose={(id) => shell.closeTab(id)}
          onRename={(id, name) => dispatch({ type: "rename", tabId: id, name })}
          onDuplicate={(id) => void shell.duplicateTab(id)}
          onMove={(from, to) => dispatch({ type: "move", from, to })}
          onReopen={() => dispatch({ type: "reopen" })}
          onShortcuts={() => setShortcutsOpen(true)}
        />
        <DrawingToolbar
          tool={tool}
          drawingCount={layout?.drawings[symbol]?.length ?? 0}
          indicatorCount={layout?.indicators.length ?? 0}
          indicatorsHidden={!!layout?.indicators.length && layout.indicators.every((i) => !i.visible)}
          onTool={(t, preset) => {
            engine?.drawings.setTool(t, preset);
            engine?.focus();
          }}
          onRemoveDrawings={() => engine?.removeAllDrawings()}
          onRemoveIndicators={() => setIndicators(() => [])}
          onIndicatorsHidden={(hidden) => setIndicators((list) => list.map((i) => ({ ...i, visible: !hidden })))}
          onObjectTree={() => openPanelRequests.emit("objects")}
        />
        <main className="chart-area">
          <ChartGrid
            tab={tab}
            linkGroups={ws.linkGroups}
            maximized={shell.maximized}
            theme={theme}
            showVolume={showVolume}
            ctx={shell.ctx}
            onSizes={(sizes) => dispatch({ type: "sizes", tabId: tab.id, sizes })}
          />
        </main>
        <PanelHost open={watchlistOpen} onOpenChange={setWatchlistOpen} integration={panelIntegration} />
        <BacktestPanel
          open={backtestOpen}
          onToggle={() => setBacktestOpen(!backtestOpen)}
          engine={engine}
          symbol={symbol}
          interval={layout?.interval ?? "1D"}
          info={active?.info ?? null}
        />

        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        {search !== null && <SymbolSearch initial={search} onPick={setSymbol} onClose={() => setSearch(null)} />}
        {compareSearch && (
          <SymbolSearch
            initial=""
            title="Compare symbol"
            onPick={(s) => update?.((l) => ((l.compare ?? []).includes(s) || s === l.symbol ? l : { ...l, compare: [...(l.compare ?? []), s] }))}
            onClose={() => setCompareSearch(false)}
          />
        )}
        {indicatorPicker && (
          <IndicatorDialog
            onAdd={(id) => {
              setIndicators((list) => [...list, newIndicator(id)]);
              setIndicatorPicker(false);
            }}
            onClose={() => setIndicatorPicker(false)}
          />
        )}
        {editingInstance && (
          <IndicatorSettings
            key={editingInstance.uid}
            instance={editingInstance}
            ordinal={editingIndex}
            theme={ctheme}
            onChange={(next) => setIndicators((list) => list.map((i) => (i.uid === next.uid ? next : i)))}
            onClose={() => setEditing(null)}
          />
        )}
        {editDrawing && engine && (
          <DrawingSettings
            key={editDrawing.id}
            drawing={editDrawing}
            theme={ctheme}
            onChange={(next) => engine.drawings.update(next.id, () => next, `settings:${next.id}`)}
            onClose={() => {
              engine.drawings.sealHistory();
              setDrawingEdit(null);
            }}
            templateMenu={() => {
              if (!layout || !update) return [];
              const glue = { engine, layout, update, openDrawingSettings: setDrawingEdit };
              return dialogTemplateMenu(editDrawing, drawingMenuState(glue).templates, drawingActions(glue));
            }}
          />
        )}
        {chartSettingsOpen && layout && (
          <ChartSettings
            value={layout.chartSettings}
            chartType={layout.chartType}
            mode={theme}
            onChange={(cs) => update?.((l) => ({ ...l, chartSettings: cs }))}
            onClose={() => setChartSettingsOpen(false)}
          />
        )}
        {textEdit && (
          <TextPrompt
            initial={textEdit.text}
            onSubmit={(text) => engine?.setDrawingText(textEdit.id, text)}
            onClose={() => setTextEdit(null)}
          />
        )}
        <PromptHost />
        {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
        {confirmClose && (
          <ConfirmDialog
            title="Close last tab"
            message="This is the last tab. Close it and start a new empty tab? Its charts can be brought back with Reopen closed tab (Alt+Shift+T)."
            confirmLabel="Close tab"
            onConfirm={() => shell.closeTab(confirmClose, true)}
            onClose={() => setConfirmClose(null)}
          />
        )}
      </div>
    </ThemeContext.Provider>
  );
}
