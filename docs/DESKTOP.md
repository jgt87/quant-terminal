# Desktop app — requirements

Behavioral requirements for packaging Quant Terminal as a desktop app (own implementation; derived from observed behavior of a reference desktop charting app — no third-party code). Each item: behavior + acceptance criterion (AC).

### Shell and lifecycle
1. **Single instance and forwarding.** A second launch focuses the running instance and passes it any URL or deep link. AC: starting the app twice gives one process tree, and the argument is handled by the first instance.
2. **Managed backends.** At startup the wrapper starts the local Node server and the Python sidecar on free localhost ports and passes the ports to the UI. It health-checks them and restarts them with backoff if they crash. On quit it shuts them down gracefully, then kills them after a timeout. AC: killing either backend shows a "reconnecting" state and recovers within 5 s; after quit, no orphan processes remain.
3. **Splash and ready gating.** No window is shown until its page signals "ready". A splash covers backend startup. AC: no white flash; the splash disappears when the first window's ready signal arrives.
4. **Save-on-quit flow.** On quit or on closing the last window, every view is asked for unsaved state. The wrapper auto-saves where it can and otherwise shows a dialog (save, discard, cancel). AC: quitting with an unsaved layout never loses it without asking.

### Windows and tabs
5. **Tabbed windows.** Tabs can be created, closed, reopened (an undo stack of at least 20 entries), duplicated, pinned, reordered by drag, reloaded and sent to another window. AC: all the keyboard shortcuts in requirement 13 work. Ctrl+Shift+T restores the last closed tab with its URL and state.
6. **Multiple windows and multi-monitor.** New windows open at a cascade position. A tab dragged outside the strip becomes a new window at the cursor, and can be dropped into another window. On startup, window bounds are clamped to the visible displays. AC: unplugging a monitor and restarting puts every window on a visible display.
7. **Session restore.** All windows (bounds, maximized and fullscreen state), tabs (url, pinned, active, title parts) and per-tab view state (layout, watchlist) are saved, debounced at 5 s or less after a change and again on quit, and restored on launch. AC: kill -9 and restart restores the state from no more than 5 s earlier.
8. **Per-tab persistent session storage.** Each tab gets a key-value store keyed by tab id and origin that survives restarts and is copied on duplicate. Use SQLite or LevelDB with repair-or-recreate on corruption. AC: a duplicated tab starts with the same state; a corrupt store is rebuilt with a logged warning and does not stop startup.
9. **Symbol, interval and time linking.** Tabs can join one of N color groups, and each group has per-channel toggles (symbol on by default; interval, time and date range optional). A change in one tab reaches every tab in the group across windows within 100 ms, without feedback loops. AC: changing the symbol in a red tab updates all red tabs and nothing else.
10. **Crosshair sync.** An optional setting broadcasts the crosshair time across linked tabs and windows. AC: on and off take effect without a reload.
11. **Error and offline view.** A failed load, 404 or renderer crash replaces only that tab with a local error page offering Reload and "Retry all failed". A banner shows when a backend or proxy is down. AC: crashing one tab's renderer leaves the other tabs working.

### Native integration
12. **Native notifications for alerts.** The UI posts `{id, title, body, symbol, sound}`. The wrapper deduplicates by id, shows an OS toast that stays until dismissed, and optionally plays a looped sound in a non-throttled context. Clicking the toast focuses the app and opens or activates the symbol. Dismissing the alert in the UI closes the toast. Alert sounds are muted for the first 30 s after launch. AC: an alert fired while the app is minimized shows a toast; clicking it opens the right chart.
13. **Keyboard shortcuts.**
    - Tabs: new tab or window, close, reopen, next and previous, go to tab N and last tab, duplicate, reload, fullscreen (F11 with a hint toast).
    - Zoom: per-window zoom in, out and reset, with a toast showing the level.
    - App: settings (Ctrl+,), quit.
    - Shortcuts are handled before the page, except when an editor has focus.
    - AC: the shortcut table is documented and every entry is covered by a test.
14. **Deep links.** Register `qterm://` (or similar) to open a symbol or layout (`qterm://chart?symbol=…`) in the focused window. AC: clicking the link in a browser opens the tab in the running instance.
15. **System tray.** A tray icon with Show, New window, alerts mute toggle, backend status and Quit. Closing all windows can keep the app in the tray, as a setting. AC: alerts still arrive when no window is open.
16. **Auto-start (optional) and auto-update.** "Start with Windows" is off by default. An update check reads a signed manifest and verifies a hash before installing. AC: a tampered package is rejected.
17. **Proxy settings.** The wrapper supports http and socks5 proxies with credentials kept in the OS credential vault (never in plain JSON), a "Test connection" button, and the proxy applied to backend and webview traffic. AC: the test reports success or failure within 10 s.
18. **Media and screen capture (later).** A screen or window picker and saved camera and microphone choices, needed only if we add recording. AC: chosen devices are remembered by label.
19. **Download handling.** A default folder or ask each time, with a progress toast. AC: exporting a CSV or PNG saves it with the expected name.

### Security and privacy
20. **Isolation everywhere.** Every webview, local UI pages included, runs with contextIsolation on, sandbox on and nodeIntegration off. No `remote` module. The only bridge is one narrow preload API. AC: `process` and `require` are undefined in every page.
21. **Typed IPC with an explicit request-type catalog.** One request/response channel with an envelope `{type, id, payload}`, one schema per type, a reply correlated by id, a timeout, and fire-and-forget only where it is declared. Events are a separate subscription type. Senders are checked: each window or view id is checked against an allow-list per type, and URL-taking calls are validated. AC: an unknown type or a sender that is not allowed is rejected and logged; the catalog is generated from code and checked in.
22. **Navigation policy.** External links open in the system browser. Only localhost and allow-listed hosts may load in-app. OAuth flows open in an isolated popup. AC: a link to an arbitrary site never loads inside the app.
23. **No click telemetry.** No UI-click breadcrumbs or analytics leave the machine. Crash reports, if any, are opt-in, local first, and carry no DOM selectors. AC: with defaults, a network capture during use shows only backend and data-provider traffic.
24. **Local logs and support bundle.** Rotating log files with a size cap, plus a "Copy diagnostics" action that bundles logs, versions and settings with secrets removed. AC: the bundle contains no credentials or tokens.

### Settings
25. **Settings UI.** Theme (light, dark or system, applied live to all views), tab title parts, auto-restore, crosshair sync, alert sound and volume, system notifications on and off, downloads, proxy, hardware acceleration, clear cache, factory reset, and About with update status. AC: every setting persists and the ones that need a relaunch say so.

### Recommended implementation approach

| Criterion | Electron | Tauri v2 | Chromium/Edge `--app` launcher |
|---|---|---|---|
| Install size | about 90 to 120 MB (bundles Chromium and Node) | about 5 to 15 MB on top of the system WebView2. Shipping a Node runtime for our server adds about 40 to 80 MB unless Node is already installed. | About 0 MB (uses installed Edge or Chrome) plus a launcher script |
| Native notifications | Yes (`Notification`, with Windows toast XML) | Yes (notification plugin) | Web Notifications only, attributed to the browser; no tray click routing |
| Multi-window, tabs as views | Yes (`BaseWindow` + `WebContentsView`, the same model the reference app uses) | Yes (multi-window; one webview per window, or several webviews per window, still marked unstable) | `window.open` popups only; no native tab strip and no cross-window drag |
| Tray | Yes | Yes | No |
| Auto-start Node server | Built in: run it in `utilityProcess` with the same runtime and no extra binary | Sidecar (`externalBin`) needs a bundled `node.exe` or a system Node | A separate launcher (PowerShell or Node) has to start it and cannot easily tell when the window closes |
| Python sidecar | `child_process.spawn` (bundled PyInstaller exe or system Python) | First-class sidecar with permissions | Launcher script |
| Deep links and single instance | Built in | Plugins (deep-link, single-instance) | No |
| Toolchain | Node and TypeScript only | Rust toolchain + Node for the front end | None |

**Recommendation: Electron.** Use `BaseWindow` with one `WebContentsView` per tab, contextIsolation, sandbox and a single typed IPC channel throughout. Reasons:

1. **The backend is Node.** Electron can host the server in a `utilityProcess` with the runtime it already ships, so we do not bundle a second runtime. Tauri's size advantage mostly disappears once `node.exe` has to be bundled.
2. **The behavior model maps directly.** Tabs as views in a frameless window, a frame page for the tab strip, cross-window drag and per-tab preload bridges are all proven Electron patterns. They are exactly what the reference app implements. Tauri's support for several webviews in one window is still marked unstable.
3. **Native toasts, tray, deep links, single instance and auto-update (electron-updater)** need no extra native code.
4. **The size cost does not matter** for a single-user local terminal, and the toolchain stays Node and TypeScript only.

**Avoid the reference app's weak points.** Do not use nodeIntegration in local pages, the remote module, unchecked IPC senders, or click breadcrumbs.

**Fallbacks:**
- A stage-0 `msedge --app=http://127.0.0.1:<port>` launcher, started from a PowerShell script that also starts the Node and Python processes, is fine for immediate use. It cannot meet requirements 5, 6, 12, 14 and 15.
- Choose **Tauri** instead only if install size becomes a hard requirement and we can count on a system Node, or compile the server into a single binary.
