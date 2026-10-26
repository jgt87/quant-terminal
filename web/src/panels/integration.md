# Mounting the right-side panels in `App.tsx`

`PanelHost` replaces the right-side `WatchlistPanel`. It renders an always-visible icon rail
(Watchlist, Alerts, Screener, Portfolio, Paper trading, Scripts) plus the open panel. It sits in
the app grid's `watch` area. `panels.css` switches the grid's right column to `auto` through
`.app:has(> .panel-host)`, so `app.css` stays as it is. It also runs the alert center (SSE
stream, toasts, sounds and desktop notifications), so keep it mounted all the time. Bind `open`
to the existing `watchlistOpen` pref; the toolbar's watchlist toggle then expands or collapses
the panel area.

## 1. Imports

```tsx
import { PanelHost, type PanelIntegration } from "./panels";
```

Delete `import { WatchlistPanel } from "./components/WatchlistPanel";` if nothing else uses it.
`WatchlistPanel` itself is unchanged and its API is the same.

## 2. Integration object

Put this after `const symbol = layout?.symbol ?? "";`, which comes after the early
`return <div className="boot">…`. It is a plain object, not a hook.

```tsx
const panelIntegration: PanelIntegration = {
  activeSymbol: symbol,
  // Loads into the active cell and its link group (same as the watchlist did).
  onLoadSymbol: setSymbol,
  getActiveChartContext: () =>
    layout ? { symbol: layout.symbol, interval: layout.interval, layoutId: layout.id, bars: engine?.data.bars ?? [] } : null,
  onAddScriptPlots: (r) => engine?.setScriptPlots(r.plots ?? null, r.outputs ?? {}),
};
```

## 3. Render

Replace

```tsx
{watchlistOpen && <WatchlistPanel activeSymbol={symbol} onSelect={setSymbol} />}
```

with

```tsx
<PanelHost open={watchlistOpen} onOpenChange={setWatchlistOpen} integration={panelIntegration} />
```

## 4. Optional: chart context menu "Add alert …"

```tsx
import { createAlertFromChart } from "./panels";
// chart background (ContextTarget kind "chart"):
{ label: `Add alert on ${formatPrice(target.price)}`, onSelect: () => createAlertFromChart(layout.symbol, layout.interval, target.price) }
// drawing (ContextTarget kind "drawing"); the layout must be saved, because the server reads the drawing from it:
{ label: "Add alert on this drawing", onSelect: () => createAlertFromChart(layout.symbol, layout.interval, { drawingId: d.id, layoutId: layout.id, type: d.type }) }
```

`createAlertFromChart` opens the Alerts panel and shows the alert dialog prefilled. For a price
the condition is "price crossing <price>". For a drawing it is "crossing" (trend lines, rays,
horizontal lines) or "entering channel" (channels, rectangles). It works from anywhere: if
PanelHost is not mounted yet, the request waits in a queue until it is.

## Other exports (`web/src/panels/index.ts`)

- `runUserScript(script, bars) → Promise<ScriptRunResult & { signals? }>`: runs a user script in
  the sandboxed worker with a 2 s limit. Use it to render saved scripts as indicators.
- `openPanelRequests.emit(id)`: opens a panel from anywhere.

## Keyboard

- Alt+Shift+1..6 open the panels. Alt+1..9 stays with the workspace tabs.
- Panel hotkeys (flag digits on watchlist rows, N / C in Alerts, B / S in the order ticket) call
  `preventDefault()`, so the app's type-to-search ignores them.
