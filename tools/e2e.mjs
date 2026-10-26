// End-to-end check of the running terminal in a real Chrome (remote debugging, default 127.0.0.1:9222).
// Usage: node tools/e2e.mjs <cdpTargetId> [baseUrl] [layoutId] — writes screenshots to docs/verification/.
// Runs on its own layout (?layout=e2e by default) so it never touches the layout a user has open.
// The workspace checks (tabs, grids, link groups, crosshair sync, deep links) reset the workspace
// of the server under test, so run it against a separate server (QT_DATA_DIR=... PORT=...); the
// reset is skipped on the live ports 4180/5180.
import fs from "node:fs";
import path from "node:path";

const [, , target, base = "http://localhost:4180", layoutId = "e2e"] = process.argv;
const outDir = path.resolve("docs/verification");
fs.mkdirSync(outDir, { recursive: true });

// CDP endpoint: the shared debugging Chrome by default; QT_CDP=127.0.0.1:9333 targets a private
// (e.g. headless) Chrome so a run never depends on which window the user has in front.
const cdpHost = process.env.QT_CDP ?? "127.0.0.1:9222";
const ws = new WebSocket(`ws://${cdpHost}/devtools/page/${target}`);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed");
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, "base64"));
};
// Moves carry no pressed button (a "left" move would be a drag); presses/releases use `button`.
const mouse = async (type, x, y, extra = {}) =>
  send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: 0, clickCount: 1, ...extra });
const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1 }); await mouse("mouseReleased", x, y); };
const rightClick = async (x, y) => {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button: "right", buttons: 2 });
  await mouse("mouseReleased", x, y, { button: "right", buttons: 0 });
};
const key = async (k, code, vk, modifiers = 0, text) => {
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
// Real key events per character (keydown/keypress/keyup), like a user typing.
const keyInfo = (ch) => {
  if (/[a-z]/i.test(ch)) return { code: `Key${ch.toUpperCase()}`, vk: ch.toUpperCase().charCodeAt(0), shift: ch !== ch.toLowerCase() };
  if (/[0-9]/.test(ch)) return { code: `Digit${ch}`, vk: ch.charCodeAt(0), shift: false };
  const map = { ":": ["Semicolon", 186, true], ".": ["Period", 190, false], "^": ["Digit6", 54, true], "=": ["Equal", 187, false], "-": ["Minus", 189, false], "/": ["Slash", 191, false] };
  const [code, vk, shift] = map[ch] ?? ["", 0, false];
  return { code, vk, shift };
};
const typeText = async (s) => {
  for (const ch of s) {
    const { code, vk, shift } = keyInfo(ch);
    await key(ch, code, vk, shift ? 8 : 0, ch);
  }
};
const waitFor = async (expr, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await js(expr).catch(() => null);
    if (v) return v;
    await sleep(250);
  }
  return null;
};
const clickSelector = async (sel) => {
  const rect = await js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; el.scrollIntoView({block:"nearest"}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  if (!rect) return false;
  await click(rect.x, rect.y);
  return true;
};
// Click a context-menu item by its label (a real mouse click at its position).
const clickMenuItem = async (labelStart) => {
  const rect = await js(`(() => { const it=[...document.querySelectorAll("[role=menu] [role=menuitem]")].find(e=>e.textContent.trim().startsWith(${JSON.stringify(labelStart)})); if(!it) return null; const r=it.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  if (!rect) return false;
  await click(rect.x, rect.y);
  return true;
};
const clickTitle = (t) => js(`(() => { const b=[...document.querySelectorAll("button")].find(b=>(b.title||b.getAttribute("aria-label")||"").startsWith(${JSON.stringify(t)})); if(!b) return false; b.click(); return true; })()`);
const chartRect = () => js(`(() => { const c=[...document.querySelectorAll("canvas")].sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]; const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const layout = () => js(`fetch("/api/layouts/${layoutId}").then(r=>r.json())`);
// Chart legends (main status line + indicator rows) as one line of text.
const legend = () => js(`(document.querySelector(".chart-overlay")?.innerText ?? "").split(String.fromCharCode(10)).join(" ")`);
// Autosave is debounced: poll the stored layout until `pred` holds (or time out).
const waitLayout = async (pred, ms = 6000) => {
  const end = Date.now() + ms;
  let l = await layout();
  while (!pred(l) && Date.now() < end) {
    await sleep(300);
    l = await layout();
  }
  return l;
};
const menuLabels = () => js(`[...document.querySelectorAll("[role=menu] [role^=menuitem]")].map(e=>e.querySelector(".ctx-label")?.textContent ?? "").join(" / ")`);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

await send("Runtime.enable");
await send("Page.enable");
await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
// Start from a fresh layout: drop the e2e layout (only ours) before loading the page.
await fetch(`${base}/api/layouts/${layoutId}`, { method: "DELETE" }).catch(() => {});
// And from a single-chart workspace (test servers only).
if (!/:(4180|5180)\b/.test(base)) {
  await fetch(`${base}/api/workspace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "default", tabs: [{ id: "e2e-main", name: "Main", grid: "1", cells: [{ layoutId }] }], activeTab: "e2e-main", crosshairSync: false, updatedAt: Date.now() }),
  }).catch(() => {});
}
await send("Page.navigate", { url: `${base}/?layout=${layoutId}` });
await sleep(5000);
// A fresh run: no drawing prefs (toolbar faces, favorites) left by an earlier run in this browser.
if (await js(`localStorage.getItem("qt.pref.drawing") !== null`)) {
  await js(`localStorage.removeItem("qt.pref.drawing"); 1`);
  await send("Page.reload");
  await sleep(5000);
}

// 1. Initial load
let L = await layout();
const text0 = await legend();
check("loads default layout", L && L.symbol, `symbol=${L?.symbol} interval=${L?.interval} indicators=${L?.indicators?.map((i) => i.indicatorId).join(",")}`);
check("legend shows OHLC values", /\bO\s?[\d,.]+/.test(text0) || /\d{3,}\.\d{2}/.test(text0));
await shot("e2e-01-load.png");

// 2. Symbol switch by typing on the chart
let r = await chartRect();
await click(r.x + r.w * 0.5, r.y + r.h * 0.4);
await key("Escape", "Escape", 27);
await typeText("MT5:EURUSD");
await sleep(1500);
await key("Enter", "Enter", 13, 0, "\r");
L = await waitLayout((l) => /EURUSD/.test(l.symbol));
check("symbol switch via type-to-search", /EURUSD/.test(L.symbol), `layout.symbol=${L.symbol}`);

// 3. Interval change
await clickTitle("15 minutes");
L = await waitLayout((l) => l.interval === "15m");
await sleep(1500);
check("interval change persists", L.interval === "15m", `interval=${L.interval}`);
const barsInfo = await js(`fetch("/api/bars?symbol=${encodeURIComponent("MT5:EURUSD")}&interval=15m&limit=1").then(r=>r.json()).then(j=>j.bars.at(-1))`);
check("MT5 bars available for chart", barsInfo && barsInfo.close > 0, JSON.stringify(barsInfo));
await shot("e2e-02-eurusd-15m.png");

// 4. Add an indicator (MACD) via the dialog: search, then click the option like a user.
await clickTitle("Add indicator");
await waitFor(`document.querySelector('[role=dialog][aria-label=Indicators]')`, 3000);
await typeText("macd");
await sleep(300);
const pickedMacd = await clickSelector(`[role=dialog][aria-label=Indicators] [role=option][data-indicator-id=macd]`);
L = await waitLayout((l) => l.indicators.some((i) => i.indicatorId === "macd"));
check("add indicator MACD", pickedMacd && L.indicators.some((i) => i.indicatorId === "macd"), L.indicators.map((i) => i.indicatorId).join(","));

// 4b. Price-axis badges never overlap (MACD macd/signal/hist, last price, EMA/RSI values).
{
  await waitFor(`(() => { const b = JSON.parse(document.querySelector(".chart-host")?.dataset.axisBadges ?? "[]"); const p = b.find(x => x.id.endsWith(":macd"))?.pane; return b.filter(x => x.pane === p).length >= 3; })()`, 8000);
  const boxes = JSON.parse((await js(`document.querySelector(".chart-host")?.dataset.axisBadges ?? "[]"`)) || "[]");
  const overlaps = [];
  for (const a of boxes) for (const b of boxes) if (a !== b && a.pane === b.pane && a.id < b.id && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${a.id}~${b.id}`);
  const macdPane = boxes.find((b) => b.id.endsWith(":macd"))?.pane;
  const macd = boxes.filter((b) => b.pane === macdPane);
  check("price-axis badges do not overlap (MACD lines + hist)", macd.length >= 3 && overlaps.length === 0, `${boxes.length} badges, MACD pane: ${macd.map((b) => `${b.id.split(":").pop()}@${b.top}-${b.bottom}`).join(" ")}${overlaps.length ? " overlaps: " + overlaps.join(",") : ""}`);
}

// 5. Freeze the price scale (price-axis menu → Auto scale off) so drawings keep their screen
// position while live data arrives, then draw a horizontal line and a trend line.
r = await chartRect();
await rightClick(r.x + r.w - 30, r.y + r.h * 0.3);
await waitFor(`document.querySelector("[role=menu]")`, 2000);
const axisMenuText = await menuLabels();
const autoBefore = await js(`document.querySelector('[role=menu] [role=menuitemcheckbox]')?.getAttribute("aria-checked")`);
await clickSelector(`[role=menu] [role=menuitemcheckbox]`);
await sleep(300);
check("price-axis menu (auto scale off)", /Auto scale/.test(axisMenuText) && /Percent/.test(axisMenuText) && autoBefore === "true", `${axisMenuText} | auto was ${autoBefore}`);
await click(r.x + r.w * 0.5, r.y + r.h * 0.3);
// Alt+H draws a horizontal line right at the cursor.
await mouse("mouseMoved", r.x + r.w * 0.45, r.y + r.h * 0.35);
await sleep(100);
await key("h", "KeyH", 72, 1);
await sleep(600);
await clickTitle("Trend line");
await sleep(200);
await click(r.x + r.w * 0.3, r.y + r.h * 0.5);
await sleep(200);
await mouse("mouseMoved", r.x + r.w * 0.5, r.y + r.h * 0.25);
await click(r.x + r.w * 0.6, r.y + r.h * 0.25);
L = await waitLayout((l) => (l.drawings?.[l.symbol] ?? []).length >= 2);
let drawings = L.drawings?.[L.symbol] ?? [];
check("drawings saved for symbol", drawings.some((d) => d.type === "hline") && drawings.some((d) => d.type === "trendline"), drawings.map((d) => d.type).join(","));
await shot("e2e-03-indicator-drawings.png");

// 5b. Right-click menus: the app's own menu (browser default prevented) on the chart, then the
// drawing menu on the horizontal line -> Settings... -> change its color -> OK (persisted), and a
// second edit that is cancelled (reverted).
await js(`window.__ctx = []; addEventListener("contextmenu", (e) => __ctx.push(e.defaultPrevented), false); 1`);
await rightClick(r.x + r.w * 0.62, r.y + r.h * 0.12);
await waitFor(`document.querySelector("[role=menu]")`, 2000);
const chartMenuText = await menuLabels();
const prevented = await js(`JSON.stringify(window.__ctx)`);
check("right-click opens the app menu (no browser menu)", chartMenuText.length > 0 && prevented === "[true]", `${chartMenuText} | defaultPrevented=${prevented}`);
await shot("e2e-05-context-menu.png");
await key("Escape", "Escape", 27);
await sleep(200);
const hline = drawings.find((d) => d.type === "hline");
await rightClick(r.x + r.w * 0.12, r.y + r.h * 0.35);
await waitFor(`document.querySelector("[role=menu]")`, 2000);
const drawingMenuText = await menuLabels();
const openedSettings = await clickMenuItem("Settings");
await waitFor(`document.querySelector('[role=dialog][aria-label="Horizontal line settings"]')`, 3000);
const dlgTabs = await js(`[...document.querySelectorAll('[role=dialog] [role=tab]')].map(t=>t.textContent).join(",")`);
await clickSelector(`[role=dialog] button[aria-label="Line color"]`);
await sleep(200);
await clickSelector(`.color-pop button[aria-label="#f23645"]`);
await sleep(300);
await shot("e2e-06-drawing-settings.png");
await clickSelector(`[role=dialog] button[data-action=ok]`);
L = await waitLayout((l) => (l.drawings?.[l.symbol] ?? []).some((d) => d.id === hline?.id && d.style?.color === "#f23645"));
const styled = (L.drawings?.[L.symbol] ?? []).find((d) => d.id === hline?.id);
check(
  "drawing settings window applies (OK)",
  /Settings/.test(drawingMenuText) && openedSettings && /Style/.test(dlgTabs) && /Coordinates/.test(dlgTabs) && styled?.style?.color === "#f23645",
  `menu: ${drawingMenuText} | tabs: ${dlgTabs} | color=${styled?.style?.color}`,
);
// Cancel reverts the live preview.
await rightClick(r.x + r.w * 0.12, r.y + r.h * 0.35);
await waitFor(`document.querySelector("[role=menu]")`, 2000);
await clickMenuItem("Settings");
await waitFor(`document.querySelector('[role=dialog][aria-label="Horizontal line settings"]')`, 3000);
await clickSelector(`[role=dialog] button[aria-label="Line color"]`);
await sleep(200);
await clickSelector(`.color-pop button[aria-label="#4caf50"]`);
await sleep(1500);
const previewed = await layout();
await clickSelector(`[role=dialog] button[data-action=cancel]`);
L = await waitLayout((l) => (l.drawings?.[l.symbol] ?? []).some((d) => d.id === hline?.id && d.style?.color === "#f23645"));
const reverted = (L.drawings?.[L.symbol] ?? []).find((d) => d.id === hline?.id);
const previewColor = (previewed.drawings?.[previewed.symbol] ?? []).find((d) => d.id === hline?.id)?.style?.color;
check("drawing settings Cancel reverts the preview", previewColor === "#4caf50" && reverted?.style?.color === "#f23645", `preview=${previewColor} -> after cancel=${reverted?.style?.color}`);
drawings = L.drawings?.[L.symbol] ?? [];

// 6. Reload → everything restored
await send("Page.reload", { ignoreCache: true });
await sleep(1000);
await send("Page.bringToFront");
await waitFor(`/MACD/.test(document.querySelector(".chart-overlay")?.innerText ?? "")`, 10000);
const L2 = await layout();
const t2 = await legend();
check("reload keeps symbol/interval/indicators/drawings",
  L2.symbol === L.symbol && L2.interval === L.interval && L2.indicators.length === L.indicators.length && (L2.drawings?.[L2.symbol] ?? []).length === drawings.length,
  `${L2.symbol} ${L2.interval} ind=${L2.indicators.length} draw=${(L2.drawings?.[L2.symbol] ?? []).length}`);
check("legend lists MACD after reload", /MACD/.test(t2));

// 7. Symbol round trip keeps drawings per symbol
await js(`void 0`);
r = await chartRect();
await click(r.x + r.w * 0.5, r.y + r.h * 0.6);
await key("Escape", "Escape", 27);
await typeText("AAPL");
await sleep(1500);
await key("Enter", "Enter", 13, 0, "\r");
await sleep(3000);
await click(r.x + r.w * 0.5, r.y + r.h * 0.6);
await key("Escape", "Escape", 27);
await typeText("MT5:EURUSD");
await sleep(1500);
await key("Enter", "Enter", 13, 0, "\r");
const L3 = await waitLayout((l) => /EURUSD/.test(l.symbol));
check("drawings survive symbol round trip", (L3.drawings?.[L3.symbol] ?? []).length === drawings.length, `${L3.symbol} draw=${(L3.drawings?.[L3.symbol] ?? []).length}`);

// 7b. One unknown symbol does not kill the shared stream: errors frame, then ticks for the rest.
{
  const res = await js(`new Promise((resolve) => {
    const out = { errors: null, ticks: 0, symbols: [] };
    const es = new EventSource("/api/stream?symbols=" + encodeURIComponent("MT5:EURUSD,MT5:NOPE_E2E,MT5:GBPUSD"));
    const done = () => { es.close(); resolve(out); };
    es.addEventListener("errors", (e) => { out.errors = JSON.parse(e.data).errors.map((x) => x.symbol); });
    es.addEventListener("tick", (e) => { const t = JSON.parse(e.data); out.ticks++; out.symbols.push(...(t.ids ?? [])); if (out.ticks >= 2) done(); });
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) done(); };
    setTimeout(done, 15000);
  })`);
  check(
    "stream survives an unknown symbol (errors frame + ticks)",
    res.errors && res.errors.includes("MT5:NOPE_E2E") && !res.errors.includes("MT5:EURUSD") && res.ticks > 0 && !res.symbols.includes("MT5:NOPE_E2E"),
    `errors=${JSON.stringify(res.errors)} ticks=${res.ticks} ids=${[...new Set(res.symbols)].join(",")}`,
  );
}

// 8. Live ticks on the MT5 FX symbol: the last bar's close changes, or (quiet market) the stream is open.
{
  const lastClose = () => js(`document.querySelector(".chart-view")?.dataset.lastClose ?? ""`);
  const streamState = () => js(`document.querySelector(".chart-view")?.dataset.stream ?? ""`);
  await waitFor(`document.querySelector(".chart-view")?.dataset.stream === "open"`, 8000);
  const c0 = await lastClose();
  const changed = await waitFor(`(document.querySelector(".chart-view")?.dataset.lastClose ?? "") !== ${JSON.stringify(c0)}`, 20000);
  const st = await streamState();
  check("live ticks update the last bar", changed || st === "open", changed ? `close ${c0} -> ${await lastClose()} (stream ${st})` : `quiet market, stream ${st}`);
}

// 9. Backtest: open the panel (only if closed), press Run, wait for the metrics.
const btOpen = await js(`document.querySelector('button[title="Backtest panel"]')?.getAttribute("aria-pressed") === "true"`);
if (!btOpen) await clickTitle("Backtest panel");
await sleep(800);
const ran = await clickSelector(`[data-testid=backtest-panel] button[aria-label="Run backtest"]`);
await waitFor(`/Sharpe/i.test(document.querySelector("[data-testid=backtest-panel]")?.innerText ?? "")`, 10000);
const bt = await js(`document.querySelector("[data-testid=backtest-panel]")?.innerText.replace(/\\s+/g," ") ?? ""`);
check("backtest runs and shows metrics", ran && /Sharpe/i.test(bt) && /drawdown/i.test(bt), (bt.match(/Sharpe.{0,60}/i)?.[0] ?? bt.slice(0, 160)));
await shot("e2e-04-backtest.png");

// 10. Theme switch: light and dark screenshots.
await clickSelector(`button[aria-label="Switch to light theme"]`);
await sleep(800);
const light = await js(`document.documentElement.dataset.theme`);
await shot("e2e-07-light.png");
await clickSelector(`button[aria-label="Switch to dark theme"]`);
await sleep(800);
const dark = await js(`document.documentElement.dataset.theme`);
await shot("e2e-08-dark.png");
check("theme toggle switches light/dark", light === "light" && dark === "dark", `${light} -> ${dark}`);

// 11. Workspace: tabs, grid, link groups, crosshair sync, session restore, deep links.
{
  const wsDoc = () => js(`fetch("/api/workspace").then(r=>r.json())`);
  const waitWs = async (pred, ms = 6000) => {
    const end = Date.now() + ms;
    let w = await wsDoc();
    while (!pred(w) && Date.now() < end) {
      await sleep(300);
      w = await wsDoc();
    }
    return w;
  };
  const activeTabOf = (w) => w.tabs.find((t) => t.id === w.activeTab);
  const cellAttr = (i, attr) => js(`document.querySelector('.grid-cell[data-cell="${i}"]')?.dataset.${attr} ?? null`);
  const cellRect = (i) =>
    js(`(() => { const el=document.querySelector('.grid-cell[data-cell="${i}"] .chart-host'); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);

  // New tab (Alt+N; browsers keep Ctrl+T for themselves).
  r = await chartRect();
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  const before = await wsDoc();
  await key("n", "KeyN", 78, 1);
  let W = await waitWs((w) => w.tabs.length === before.tabs.length + 1);
  const domTabs = await js(`document.querySelectorAll(".ws-tab").length`);
  const newTabId = W.activeTab;
  check("new tab (Alt+N)", W.tabs.length === before.tabs.length + 1 && domTabs === W.tabs.length && newTabId !== before.activeTab, `tabs ${before.tabs.length} -> ${W.tabs.length}, active ${newTabId}`);

  // Grid 4 from the toolbar picker.
  await clickSelector(`button[aria-label="Chart grid"]`);
  await waitFor(`document.querySelector('.grid-menu')`, 2000);
  await clickSelector(`.grid-menu [data-grid="4"]`);
  await waitFor(`document.querySelectorAll(".grid-cell").length === 4`, 5000);
  W = await waitWs((w) => activeTabOf(w)?.grid === "4");
  await waitFor(`[...document.querySelectorAll(".grid-cell")].every(c => c.dataset.symbol)`, 10000);
  check(
    "grid 4 shows four independent charts",
    activeTabOf(W)?.grid === "4" &&
      new Set(activeTabOf(W).cells.slice(0, 4).map((c) => c.layoutId)).size === 4 &&
      (await js(`document.querySelectorAll(".grid-cell .chart-host").length`)) === 4,
    `cells=${activeTabOf(W)?.cells.map((c) => c.layoutId).join(",")}`,
  );

  // Link cells 0 and 1 red.
  for (const i of [0, 1]) {
    await clickSelector(`.grid-cell[data-cell="${i}"] .link-btn`);
    await waitFor(`document.querySelector('.link-pop')`, 2000);
    await clickSelector(`.link-pop button[aria-label="Link red"]`);
    await key("Escape", "Escape", 27);
    await sleep(200);
  }
  W = await waitWs((w) => activeTabOf(w)?.cells[0]?.link === "red" && activeTabOf(w)?.cells[1]?.link === "red");
  check(
    "link two cells red",
    activeTabOf(W)?.cells[0]?.link === "red" && activeTabOf(W)?.cells[1]?.link === "red" && !activeTabOf(W)?.cells[2]?.link,
    activeTabOf(W)?.cells.map((c) => c.link ?? "-").join(","),
  );

  // Symbol change in cell 0: cell 1 (red) follows, cell 2 (unlinked) does not.
  const sym2Before = await cellAttr(2, "symbol");
  r = await cellRect(0);
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  await key("Escape", "Escape", 27);
  await typeText("MSFT");
  await sleep(1500);
  await key("Enter", "Enter", 13, 0, "\r");
  await waitFor(`document.querySelector('.grid-cell[data-cell="0"]')?.dataset.symbol === "MSFT"`, 5000);
  const followed = [await cellAttr(0, "symbol"), await cellAttr(1, "symbol"), await cellAttr(2, "symbol")];
  check(
    "symbol change propagates to the link group only",
    followed[0] === "MSFT" && followed[1] === "MSFT" && followed[2] === sym2Before && sym2Before !== "MSFT",
    followed.join(" / "),
  );

  // Crosshair sync: hovering cell 0 draws a vertical crosshair in cell 1 (same group) too.
  await clickSelector(`button[aria-label="Crosshair sync"]`);
  await sleep(2500);
  r = await cellRect(0);
  await mouse("mouseMoved", r.x + r.w * 0.4, r.y + r.h * 0.4);
  await sleep(150);
  await mouse("mouseMoved", r.x + r.w * 0.45, r.y + r.h * 0.45);
  await sleep(400);
  const xs = [];
  for (const i of [0, 1, 2]) xs.push(await js(`document.querySelector('.grid-cell[data-cell="${i}"] .chart-host')?.dataset.crosshairX ?? null`));
  await shot("e2e-11-crosshair-sync.png");
  check("crosshair sync draws in both linked cells", xs[0] != null && xs[1] != null && xs[2] == null, `x: ${xs.join(" / ")}`);

  // Resize a splitter (sizes persist), make cell 3 active, then reload: everything restored.
  const split = await js(`(() => { const el=document.querySelector('.grid-splitter.col'); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height*0.25}; })()`);
  await mouse("mouseMoved", split.x, split.y);
  await mouse("mousePressed", split.x, split.y, { buttons: 1 });
  await mouse("mouseMoved", split.x - 60, split.y, { button: "left", buttons: 1 });
  await mouse("mouseMoved", split.x - 120, split.y, { button: "left", buttons: 1 });
  await mouse("mouseReleased", split.x - 120, split.y);
  r = await cellRect(3);
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  W = await waitWs((w) => activeTabOf(w)?.sizes?.[0] < 0.49 && w.crosshairSync === true);
  const savedSizes = activeTabOf(W)?.sizes;
  await sleep(1200);
  await send("Page.reload", { ignoreCache: true });
  await sleep(1000);
  await waitFor(`document.querySelectorAll(".grid-cell").length === 4 && document.querySelector('.grid-cell[data-cell="1"]')?.dataset.symbol === "MSFT"`, 12000);
  const restored = await js(`(() => ({
    tabs: document.querySelectorAll(".ws-tab").length,
    activeTab: document.querySelector(".ws-tab.active")?.dataset.tabId,
    cells: document.querySelectorAll(".grid-cell").length,
    active: document.querySelector(".grid-cell.active")?.dataset.cell,
    links: [...document.querySelectorAll(".grid-cell .link-btn")].map(b => b.dataset.link).join(","),
    sync: document.querySelector('button[aria-label="Crosshair sync"]')?.getAttribute("aria-pressed"),
    w0: document.querySelector(".grid-slot").getBoundingClientRect().width,
    w1: document.querySelectorAll(".grid-slot")[1].getBoundingClientRect().width,
    symbols: [...document.querySelectorAll(".grid-cell")].map(c => c.dataset.symbol).join(","),
  }))()`);
  check(
    "reload restores tabs, grid, sizes, active cell, links and crosshair sync",
    restored.tabs === W.tabs.length &&
      restored.activeTab === newTabId &&
      restored.cells === 4 &&
      restored.active === "3" &&
      restored.links === "red,red,none,none" &&
      restored.sync === "true" &&
      restored.w0 < restored.w1 - 100,
    `${JSON.stringify(restored)} sizes=${JSON.stringify(savedSizes)}`,
  );

  // 4-chart linked grid in dark and light (backtest panel closed so the grid gets the height).
  if (await js(`document.querySelector('button[title="Backtest panel"]')?.getAttribute("aria-pressed") === "true"`)) await clickTitle("Backtest panel");
  await sleep(1500);
  r = await cellRect(0);
  await mouse("mouseMoved", r.x + r.w * 0.6, r.y + r.h * 0.4);
  await sleep(400);
  await shot("e2e-12-grid-linked-dark.png");
  await clickSelector(`button[aria-label="Switch to light theme"]`);
  await sleep(800);
  await mouse("mouseMoved", r.x + r.w * 0.6, r.y + r.h * 0.42);
  await sleep(400);
  await shot("e2e-13-grid-linked-light.png");
  await clickSelector(`button[aria-label="Switch to dark theme"]`);
  await sleep(500);

  // Maximize the active cell (Alt+Enter) and restore.
  r = await cellRect(0);
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  await key("Enter", "Enter", 13, 1);
  await sleep(300);
  const maxed = await js(`document.querySelectorAll(".grid-slot:not(.hidden)").length`);
  await key("Enter", "Enter", 13, 1);
  await sleep(300);
  const unmaxed = await js(`document.querySelectorAll(".grid-slot:not(.hidden)").length`);
  check("Alt+Enter maximizes and restores the active chart", maxed === 1 && unmaxed === 4, `${maxed} -> ${unmaxed}`);

  // Close (Alt+W) and reopen (Alt+Shift+T) the tab.
  await key("w", "KeyW", 87, 1);
  W = await waitWs((w) => !w.tabs.some((t) => t.id === newTabId));
  const closedOk = !W.tabs.some((t) => t.id === newTabId);
  await key("T", "KeyT", 84, 1 | 8);
  W = await waitWs((w) => w.tabs.some((t) => t.id === newTabId) && w.activeTab === newTabId);
  check(
    "close tab (Alt+W) and reopen it (Alt+Shift+T)",
    closedOk && activeTabOf(W)?.id === newTabId && activeTabOf(W)?.grid === "4",
    `closed=${closedOk} reopened=${activeTabOf(W)?.id}`,
  );

  // Shortcut help dialog on "?".
  await waitFor(`document.querySelectorAll(".grid-cell .chart-host").length === 4`, 5000);
  r = await cellRect(0);
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  await key("?", "Slash", 191, 8, "?");
  await waitFor(`document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]')`, 2000);
  const helpText = await js(`document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]')?.innerText ?? ""`);
  check("shortcut help lists the actual bindings", /Alt\+N/.test(helpText) && /Alt\+W/.test(helpText) && /Ctrl\+T/.test(helpText), helpText.replace(/\s+/g, " ").slice(0, 120));
  await key("Escape", "Escape", 27);

  // Deep links: ?symbol=...&interval=... load into the active cell; the URL then follows it.
  await send("Page.navigate", { url: `${base}/?symbol=AAPL&interval=1h` });
  await sleep(1000);
  await waitFor(`document.querySelector(".grid-cell.active")?.dataset.symbol === "AAPL"`, 12000);
  const deep = await js(`({ sym: document.querySelector(".grid-cell.active")?.dataset.symbol, iv: document.querySelector(".grid-cell.active")?.dataset.interval, url: location.search })`);
  await send("Page.navigate", { url: `${base}/?symbol=MSFT` });
  await sleep(1000);
  await waitFor(`document.querySelector(".grid-cell.active")?.dataset.symbol === "MSFT"`, 12000);
  const deep2 = await js(`({ sym: document.querySelector(".grid-cell.active")?.dataset.symbol, url: location.search })`);
  check(
    "deep link ?symbol=MSFT loads into the active cell and the URL follows it",
    deep.sym === "AAPL" && deep.iv === "1h" && deep2.sym === "MSFT" && /tab=/.test(deep2.url) && /symbol=MSFT/.test(deep2.url),
    `${JSON.stringify(deep)} then ${JSON.stringify(deep2)}`,
  );

  // Shared data: identical bar requests of several cells are fetched once, one tick stream at most.
  await sleep(2000);
  const perf = await js(`(() => { const all = performance.getEntriesByType("resource"); const n = all.filter(e => e.name.includes("/api/bars?") && e.name.includes("limit=1000")); const by = {}; for (const e of n) by[e.name] = (by[e.name] ?? 0) + 1; return { dupes: Object.values(by).filter(v => v > 1).length, total: n.length, streams: all.filter(e => e.name.includes("/api/stream")).length }; })()`);
  check("bar requests are deduplicated across cells", perf.dupes === 0 && perf.streams <= 1, JSON.stringify(perf));
}

// Right-side panels (alerts, screener, portfolio, paper, scripts, watchlist extras) on /panels.html.
if (process.env.QT_E2E_PANELS !== "0") {
  const { runPanelChecks } = await import("./e2e-panels.mjs");
  await runPanelChecks({ send, js, sleep, waitFor, check, shot, base });
}

// 12. Chart features (G4): chart types, profiles, patterns, compare, formulas, custom intervals,
// Bar Replay with paper trading and export — on its own single-chart layout.
if (!/:(4180|5180)\b/.test(base)) {
  const g4 = `${layoutId}-g4`;
  const g4Layout = () => js(`fetch("/api/layouts/${g4}").then(r=>r.json())`);
  const waitG4 = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    let l = await g4Layout();
    while (!pred(l) && Date.now() < end) {
      await sleep(300);
      l = await g4Layout();
    }
    return l;
  };
  const view = (k) => js(`document.querySelector(".chart-view")?.dataset.${k} ?? null`);
  const clickMenuItem = (label) =>
    js(`(() => { const el=[...document.querySelectorAll("[role=menu] [role^=menuitem]")].find(e=>(e.querySelector(".ctx-label")?.textContent ?? e.textContent ?? "").trim().startsWith(${JSON.stringify(label)})); if(!el) return false; el.click(); return true; })()`);
  const themeShot = async (name) => {
    await mouse("mouseMoved", r.x + r.w * 0.55, r.y + r.h * 0.45);
    await sleep(300);
    await shot(`e2e-g4-${name}-dark.png`);
    await clickSelector(`button[aria-label="Switch to light theme"]`);
    await sleep(700);
    await mouse("mouseMoved", r.x + r.w * 0.55, r.y + r.h * 0.46);
    await sleep(300);
    await shot(`e2e-g4-${name}-light.png`);
    await clickSelector(`button[aria-label="Switch to dark theme"]`);
    await sleep(500);
  };
  const addStudy = async (query, id) => {
    await clickTitle("Add indicator");
    await waitFor(`document.querySelector('[role=dialog][aria-label=Indicators]')`, 3000);
    await typeText(query);
    await sleep(300);
    return clickSelector(`[role=dialog][aria-label=Indicators] [role=option][data-indicator-id="${id}"]`);
  };
  const pickSymbol = async (s) => {
    await clickSelector(`button.symbol-btn`);
    await waitFor(`document.querySelector('[role=dialog] input[aria-label=Symbol]')`, 3000);
    await typeText(s);
    await sleep(1200);
    await key("Enter", "Enter", 13, 0, "\r");
  };

  await fetch(`${base}/api/layouts/${g4}`, { method: "DELETE" }).catch(() => {});
  await fetch(`${base}/api/layouts/${g4}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: g4, name: "G4", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: {}, updatedAt: Date.now() }),
  });
  await fetch(`${base}/api/workspace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "default", tabs: [{ id: "g4-main", name: "G4", grid: "1", cells: [{ layoutId: g4 }] }], activeTab: "g4-main", crosshairSync: false, updatedAt: Date.now() }),
  });
  await send("Page.navigate", { url: `${base}/?layout=${g4}` });
  await sleep(1000);
  await waitFor(`Number(document.querySelector(".chart-view")?.dataset.bars) > 100`, 15000);
  if (await js(`document.querySelector('button[title="Backtest panel"]')?.getAttribute("aria-pressed") === "true"`)) await clickTitle("Backtest panel");
  await sleep(800);
  r = await chartRect();

  // Renko from the chart-type dropdown.
  await clickSelector(`button[title="Chart type"]`);
  await waitFor(`document.querySelector(".dropdown-menu")`, 2000);
  await js(`[...document.querySelectorAll(".dropdown-menu [role=menuitemradio]")].find(b=>b.textContent==="Renko")?.click()`);
  let G = await waitG4((l) => l.chartType === "renko");
  await waitFor(`/Transformed: Renko/.test(document.querySelector(".chart-overlay")?.innerText ?? "")`, 8000);
  const renkoLegend = await js(`document.querySelector("[data-testid=legend-transform]")?.textContent ?? ""`);
  const renkoBars = Number(await view("bars"));
  check("chart type Renko (index axis, transformed status)", G.chartType === "renko" && /Renko/.test(renkoLegend) && renkoBars > 5, `${renkoLegend} · ${renkoBars} bricks`);
  await themeShot("renko");

  // Back to candles; Volume Profile (visible range) from the Indicators dialog.
  await clickSelector(`button[title="Chart type"]`);
  await waitFor(`document.querySelector(".dropdown-menu")`, 2000);
  await js(`[...document.querySelectorAll(".dropdown-menu [role=menuitemradio]")].find(b=>b.textContent==="Candles")?.click()`);
  await waitG4((l) => l.chartType === "candles");
  const vpPicked = await addStudy("volume profile", "vp-visible");
  G = await waitG4((l) => l.indicators.some((i) => i.indicatorId === "vp-visible"));
  await waitFor(`/VPVR/.test(document.querySelector(".chart-overlay")?.innerText ?? "")`, 5000);
  check("Volume Profile visible range added", vpPicked && G.indicators.some((i) => i.indicatorId === "vp-visible") && /VPVR/.test(await legend()), G.indicators.map((i) => i.indicatorId).join(","));
  await themeShot("volume-profile");
  // Remove it again so the next screenshots show patterns clearly.
  await js(`[...document.querySelectorAll(".legend-ind")].find(e=>/VPVR/.test(e.textContent))?.querySelector('button[title=Remove]')?.click()`);
  await waitG4((l) => !l.indicators.some((i) => i.indicatorId === "vp-visible"));

  // Candlestick patterns overlay (+ tooltip on a bar with a pattern).
  const cpPicked = await addStudy("candlestick", "candle-patterns");
  G = await waitG4((l) => l.indicators.some((i) => i.indicatorId === "candle-patterns"));
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  await key("+", "Equal", 187, 0, "+");
  await key("+", "Equal", 187, 0, "+");
  await key("+", "Equal", 187, 0, "+");
  await sleep(500);
  let tip = null;
  for (let k = 0; k < 60 && !tip; k++) {
    await mouse("mouseMoved", r.x + r.w * (0.25 + k * 0.011), r.y + r.h * 0.5);
    await sleep(60);
    tip = await js(`document.querySelector("[data-testid=pattern-tip]")?.innerText ?? null`);
  }
  check("candlestick patterns overlay (labels + tooltip)", cpPicked && G.indicators.some((i) => i.indicatorId === "candle-patterns") && !!tip, `tooltip: ${tip ?? "none found"}`);
  await themeShot("patterns");
  await js(`[...document.querySelectorAll(".legend-ind")].find(e=>/^Candles/.test(e.textContent))?.querySelector('button[title=Remove]')?.click()`);
  await waitG4((l) => !l.indicators.some((i) => i.indicatorId === "candle-patterns"));

  // Auto Fib: convert the study's current geometry into an editable fib drawing (chart menu).
  await addStudy("auto fib", "autofib");
  await waitG4((l) => l.indicators.some((i) => i.indicatorId === "autofib"));
  await rightClick(r.x + r.w * 0.4, r.y + r.h * 0.12);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  const converted = await clickMenuItem("Convert Auto Fib");
  G = await waitG4((l) => (l.drawings?.[l.symbol] ?? []).some((d) => d.type === "fib"));
  const fibDrawing = (G.drawings?.[G.symbol] ?? []).find((d) => d.type === "fib");
  check("auto fib converts to an editable fib drawing", converted && fibDrawing?.anchors?.length === 2, JSON.stringify(fibDrawing?.anchors ?? null));
  await js(`[...document.querySelectorAll(".legend-ind")].find(e=>/^Auto Fib/.test(e.textContent))?.querySelector('button[title=Remove]')?.click()`);
  await waitG4((l) => !l.indicators.some((i) => i.indicatorId === "autofib"));
  await rightClick(r.x + r.w * 0.5, r.y + r.h * 0.95);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  await clickMenuItem("Remove 1 drawing");
  await waitG4((l) => !(l.drawings?.[l.symbol] ?? []).length);

  // Compare MSFT.
  await clickTitle("Compare symbols");
  await waitFor(`document.querySelector('[role=dialog][aria-label="Compare symbol"]')`, 3000);
  await typeText("MSFT");
  await sleep(1200);
  await key("Enter", "Enter", 13, 0, "\r");
  G = await waitG4((l) => (l.compare ?? []).includes("MSFT"));
  await waitFor(`document.querySelector('[data-compare-symbol="MSFT"] .legend-ind-val')?.textContent.includes("%")`, 8000);
  const cmp = await js(`document.querySelector('[data-compare-symbol="MSFT"]')?.innerText ?? ""`);
  check("compare MSFT as a percent overlay", (G.compare ?? []).includes("MSFT") && /%/.test(cmp), cmp.replace(/\s+/g, " "));
  {
    // Page the main series back (earlier steps may already have): the compare leg pages along
    // until it covers the main series' first bar or reaches its own first bar.
    const host = (k) => js(`document.querySelector(".chart-host")?.dataset.${k} ?? ""`);
    await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
    for (let k = 0; k < 10; k++) {
      await key("-", "Minus", 189, 0, "-");
      await sleep(80);
    }
    for (let k = 0; k < 6; k++) {
      await mouse("mouseMoved", r.x + r.w * 0.15, r.y + r.h * 0.5);
      await mouse("mousePressed", r.x + r.w * 0.15, r.y + r.h * 0.5, { buttons: 1 });
      await mouse("mouseMoved", r.x + r.w * 0.6, r.y + r.h * 0.5, { button: "left", buttons: 1 });
      await mouse("mouseMoved", r.x + r.w * 0.95, r.y + r.h * 0.5, { button: "left", buttons: 1 });
      await mouse("mouseReleased", r.x + r.w * 0.95, r.y + r.h * 0.5);
      await sleep(500);
    }
    const covered = `(() => { const h = document.querySelector(".chart-host").dataset; const c = Number((h.compareFirst ?? "").split(",")[0]); return c > 0 && (c <= Number(h.firstTime) + 7 * 86400 || (h.compareMore ?? "").split(",")[0] === "false"); })()`;
    await waitFor(covered, 20000);
    const m1 = Number(await host("firstTime"));
    const c1 = Number((await host("compareFirst")).split(",")[0]);
    const more = (await host("compareMore")).split(",")[0];
    const cmpPaged = await js(`performance.getEntriesByType("resource").some(e => e.name.includes("/api/bars?") && e.name.includes("symbol=MSFT") && e.name.includes("to="))`);
    const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
    check(
      "compare overlay extends after the main series pages",
      cmpPaged && c1 > 0 && (c1 <= m1 + 7 * 86400 || more === "false") && c1 < Date.now() / 1000 - 6 * 365 * 86400,
      `main from ${day(m1)}, MSFT from ${day(c1)} (more=${more}), MSFT older page requested: ${cmpPaged}`,
    );
  }
  await js(`document.querySelector('[data-compare-symbol="MSFT"] button')?.click()`);
  G = await waitG4((l) => !(l.compare ?? []).length);

  // Formula AAPL/MSFT from symbol search.
  await pickSymbol("AAPL/MSFT");
  G = await waitG4((l) => l.symbol === "AAPL/MSFT");
  await waitFor(`Number(document.querySelector(".chart-view")?.dataset.bars) > 50 && /Formula/.test(document.querySelector(".legend-main")?.innerText ?? "")`, 12000);
  const fBars = Number(await view("bars"));
  const fClose = await js(`document.querySelector(".chart-view")?.dataset.lastClose`);
  check("formula chart AAPL/MSFT", G.symbol === "AAPL/MSFT" && fBars > 50 && Number(fClose) > 0 && Number(fClose) < 5, `${fBars} bars, last ratio ${fClose}`);

  // Custom interval 2h (fetched as 1h, resampled), with history paging.
  await pickSymbol("AAPL");
  await waitG4((l) => l.symbol === "AAPL");
  await clickSelector(`button[aria-label="Custom interval"]`);
  await waitFor(`document.querySelector(".custom-interval-menu")`, 2000);
  await js(`[...document.querySelectorAll(".custom-interval-menu button")].find(b=>b.textContent==="2h")?.click()`);
  G = await waitG4((l) => l.customInterval === "2h");
  await waitFor(`/\\b2h\\b/.test(document.querySelector(".legend-main")?.innerText ?? "") && Number(document.querySelector(".chart-view")?.dataset.bars) > 50`, 12000);
  const b2h0 = Number(await view("bars"));
  const t2h = await js(`(() => { const t=[...document.querySelectorAll(".chart-host")][0]; return 1; })()`);
  void t2h;
  for (let k = 0; k < 8; k++) {
    await mouse("mouseMoved", r.x + r.w * 0.2, r.y + r.h * 0.5);
    await mouse("mousePressed", r.x + r.w * 0.2, r.y + r.h * 0.5, { buttons: 1 });
    await mouse("mouseMoved", r.x + r.w * 0.6, r.y + r.h * 0.5, { button: "left", buttons: 1 });
    await mouse("mouseMoved", r.x + r.w * 0.95, r.y + r.h * 0.5, { button: "left", buttons: 1 });
    await mouse("mouseReleased", r.x + r.w * 0.95, r.y + r.h * 0.5);
    await sleep(400);
  }
  await waitFor(`Number(document.querySelector(".chart-view")?.dataset.bars) > ${b2h0}`, 8000);
  const b2h1 = Number(await view("bars"));
  const paged = await js(`performance.getEntriesByType("resource").some(e => e.name.includes("/api/bars?") && e.name.includes("interval=1h") && e.name.includes("to="))`);
  check("custom interval 2h (from 1h) with history paging", G.customInterval === "2h" && G.interval === "1h" && b2h1 > b2h0 && paged, `bars ${b2h0} -> ${b2h1}, older page requested: ${paged}`);
  {
    // Session-aligned buckets: each day's first 2h bar starts at the 09:30 New York open,
    // 13:30 UTC while New York is on daylight time and 14:30 UTC otherwise.
    const times = (await js(`document.querySelector(".chart-host")?.dataset.barTimes ?? ""`)).split(",").map(Number).filter(Boolean);
    const firstOfDay = new Map();
    for (const t of times) {
      const d = new Date(t * 1000).toISOString().slice(0, 10);
      if (!firstOfDay.has(d)) firstOfDay.set(d, t);
    }
    const nyOffsetH = (t) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t * 1000)).map((x) => [x.type, Number(x.value)]));
      return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 1000 - t) / 3600;
    };
    let ok = 0;
    let dst = 0;
    let std = 0;
    const bad = [];
    for (const [d, t] of firstOfDay) {
      const hhmm = new Date(t * 1000).toISOString().slice(11, 16);
      const want = nyOffsetH(t) === -4 ? "13:30" : "14:30";
      if (hhmm === want) {
        ok++;
        if (want === "13:30") dst++;
        else std++;
      } else bad.push(`${d} ${hhmm}`);
    }
    const days = firstOfDay.size;
    check(
      "2h buckets on AAPL start at the session open (13:30 / 14:30 UTC by DST)",
      days > 20 && ok >= days - 2 && dst > 0 && std > 0,
      `${ok}/${days} days aligned (summer ${dst}, winter ${std})${bad.length ? " off: " + bad.slice(0, 4).join(", ") : ""}`,
    );
  }
  await clickTitle("1 day");
  G = await waitG4((l) => l.interval === "1D" && !l.customInterval);
  await waitFor(`Number(document.querySelector(".chart-view")?.dataset.bars) > 100`, 10000);

  // Bar Replay: pick a start bar, step 5, buy, step 5, P&L shows, exit.
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  const fullBars = Number(await view("bars"));
  await clickTitle("Bar replay");
  await waitFor(`document.querySelector(".chart-view")?.dataset.replay === "select"`, 3000);
  await click(r.x + r.w * 0.5, r.y + r.h * 0.5);
  await waitFor(`document.querySelector(".chart-view")?.dataset.replay === "on"`, 3000);
  const startBars = Number(await view("bars"));
  for (let k = 0; k < 5; k++) {
    await key("ArrowRight", "ArrowRight", 39, 8);
    await sleep(80);
  }
  await sleep(300);
  const afterStep = Number(await view("bars"));
  await clickSelector(`.replay-bar button[aria-label=Buy]`);
  await sleep(200);
  const pos = await js(`document.querySelector("[data-testid=replay-position]")?.textContent ?? ""`);
  await clickSelector(`.replay-bar button[aria-label="Step forward"]`);
  for (let k = 0; k < 4; k++) {
    await key("ArrowRight", "ArrowRight", 39, 8);
    await sleep(80);
  }
  await sleep(300);
  const afterBuy = Number(await view("bars"));
  const pnl = await js(`document.querySelector("[data-testid=replay-pnl]")?.textContent ?? ""`);
  check(
    "replay: start, step 5, buy, step 5, P&L shown",
    startBars < fullBars && afterStep === startBars + 5 && afterBuy === startBars + 10 && /^Long 10 @/.test(pos) && /P&L [+\-−]?\d/.test(pnl) && !/P&L \+?0\.00$/.test(pnl),
    `bars full=${fullBars} start=${startBars} +5=${afterStep} +10=${afterBuy} · ${pos} · ${pnl}`,
  );
  await themeShot("replay");
  await clickSelector(`.replay-bar button[aria-label="Exit replay"]`);
  await waitFor(`document.querySelector(".chart-view")?.dataset.replay === "off"`, 3000);
  const exitBars = Number(await view("bars"));
  check("replay exit restores every bar", exitBars === fullBars, `${exitBars} of ${fullBars}`);

  // Export data (CSV) and Save image (PNG) from the chart menu.
  await js(`window.__blobs = []; (() => { const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return o(b); }; })(); 1`);
  await rightClick(r.x + r.w * 0.5, r.y + r.h * 0.15);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  const hasExport = await clickMenuItem("Export data (CSV)");
  await sleep(500);
  const csv = await js(`(async () => { const b = window.__blobs.at(-1); if (!b) return null; const t = await b.text(); const lines = t.trim().split(/\\r?\\n/); return { type: b.type, header: lines[0], rows: lines.length - 1 }; })()`);
  const nBars = Number(await view("bars"));
  check(
    "export CSV produces a download with every bar",
    hasExport && csv && csv.type === "text/csv" && /^time,open,high,low,close,volume/.test(csv.header) && csv.rows === nBars,
    csv ? `${csv.header} · ${csv.rows} rows / ${nBars} bars` : "no blob",
  );
  await rightClick(r.x + r.w * 0.5, r.y + r.h * 0.15);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  await clickMenuItem("Save image (PNG)");
  await waitFor(`window.__blobs.at(-1)?.type === "image/png"`, 5000);
  const png = await js(`(() => { const b = window.__blobs.at(-1); return b ? { type: b.type, size: b.size } : null; })()`);
  check("save image produces a PNG", png?.type === "image/png" && png.size > 5000, JSON.stringify(png));
}

// 13. Drawing tools (registry architecture): drag-to-create, multi-select + group move, undo,
// copy/paste, templates, object tree, favorites bar, lock all — on its own layout.
if (!/:(4180|5180)\b/.test(base) && process.env.QT_E2E_DRAW !== "0") {
  const DL = `${layoutId}-draw`;
  const dLayout = () => js(`fetch("/api/layouts/${DL}").then(r=>r.json())`);
  const waitD = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    let l = await dLayout();
    while (!pred(l) && Date.now() < end) {
      await sleep(300);
      l = await dLayout();
    }
    return l;
  };
  const list = (l) => l?.drawings?.[l.symbol] ?? [];
  const ctrlClick = async (x, y) => {
    await mouse("mouseMoved", x, y, { modifiers: 2 });
    await mouse("mousePressed", x, y, { buttons: 1, modifiers: 2 });
    await mouse("mouseReleased", x, y, { modifiers: 2 });
  };
  const drag = async (x0, y0, x1, y1, modifiers = 0) => {
    await mouse("mouseMoved", x0, y0, { modifiers });
    await mouse("mousePressed", x0, y0, { buttons: 1, modifiers });
    for (let k = 1; k <= 6; k++) await mouse("mouseMoved", x0 + ((x1 - x0) * k) / 6, y0 + ((y1 - y0) * k) / 6, { button: "left", buttons: 1, modifiers });
    await mouse("mouseReleased", x1, y1, { modifiers });
  };
  const ctrlKey = async (k, code, vk) => key(k, code, vk, 2);
  const menuItem = (label) =>
    js(`(() => { const el=[...document.querySelectorAll("[role=menu] [role^=menuitem]")].find(e=>(e.querySelector(".ctx-label")?.textContent ?? "").trim().startsWith(${JSON.stringify(label)})); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  const hoverMenu = async (label) => {
    const p = await menuItem(label);
    if (p) {
      await mouse("mouseMoved", p.x, p.y);
      await sleep(250);
    }
    return Boolean(p);
  };
  const clickMenu = async (label) => {
    const p = await menuItem(label);
    if (p) await click(p.x, p.y);
    return Boolean(p);
  };
  const themeBoth = async (name) => {
    await shot(`e2e-draw-${name}-dark.png`);
    await js(`document.querySelector('button[aria-label="Switch to light theme"]')?.click()`);
    await sleep(500);
    await shot(`e2e-draw-${name}-light.png`);
    await js(`document.querySelector('button[aria-label="Switch to dark theme"]')?.click()`);
    await sleep(400);
  };
  const selected = () => js(`Number(document.querySelector(".chart-view")?.dataset.selectedDrawings ?? -1)`);

  await fetch(`${base}/api/layouts/${DL}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: DL, name: "Draw", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: {}, updatedAt: Date.now() }),
  });
  await fetch(`${base}/api/workspace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "default", tabs: [{ id: "draw-main", name: "Draw", grid: "1", cells: [{ layoutId: DL }] }], activeTab: "draw-main", crosshairSync: false, updatedAt: Date.now() }),
  });
  await fetch(`${base}/api/drawing-templates`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
  await js(`localStorage.removeItem("qt.pref.drawing"); sessionStorage.removeItem("qt.floatbar.pos"); 1`);
  await send("Page.navigate", { url: `${base}/?layout=${DL}` });
  await sleep(1000);
  await waitFor(`Number(document.querySelector(".chart-view")?.dataset.bars) > 100`, 15000);
  if (await js(`document.querySelector('button[title="Backtest panel"]')?.getAttribute("aria-pressed") === "true"`)) await clickTitle("Backtest panel");
  await sleep(800);
  r = await chartRect();
  // Freeze the price scale so drawings keep their screen positions.
  await rightClick(r.x + r.w - 30, r.y + r.h * 0.3);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  await clickSelector(`[role=menu] [role=menuitemcheckbox]`);
  await sleep(300);
  const P = (fx, fy) => ({ x: r.x + r.w * fx, y: r.y + r.h * fy });

  // Drag-to-create two trend lines (press, drag, release).
  await clickTitle("Trend line");
  await sleep(150);
  const a0 = P(0.25, 0.55), a1 = P(0.45, 0.35);
  await drag(a0.x, a0.y, a1.x, a1.y);
  await sleep(200);
  await clickTitle("Trend line");
  await sleep(150);
  const c0 = P(0.25, 0.75), c1 = P(0.45, 0.6);
  await drag(c0.x, c0.y, c1.x, c1.y);
  let D = await waitD((l) => list(l).length === 2);
  const [l1, l2] = list(D);
  check(
    "drag-to-create draws trend lines in one gesture",
    list(D).length === 2 && l1.type === "trendline" && l1.anchors.length === 2 && l1.anchors[0].time !== l1.anchors[1].time,
    JSON.stringify(list(D).map((d) => d.anchors.map((x) => x.time))),
  );
  await shot("e2e-draw-01-created.png");

  // Multi-select (click + Ctrl+click) and group move.
  const mid1 = P(0.35, 0.45);
  const mid2 = P(0.35, 0.675);
  await click(mid1.x, mid1.y);
  await sleep(150);
  await ctrlClick(mid2.x, mid2.y);
  await sleep(200);
  const sel = await selected();
  await drag(mid1.x, mid1.y, mid1.x + 80, mid1.y + 30);
  D = await waitD((l) => list(l).every((d, i) => d.anchors[0].time !== [l1, l2][i].anchors[0].time));
  const moved = list(D);
  check(
    "multi-select two drawings and move them together",
    sel === 2 && moved.length === 2 && moved[0].anchors[0].time > l1.anchors[0].time && moved[1].anchors[0].time > l2.anchors[0].time,
    `selected=${sel} t0 ${l1.anchors[0].time}->${moved[0]?.anchors[0].time} / ${l2.anchors[0].time}->${moved[1]?.anchors[0].time}`,
  );

  // Ctrl+Z restores the positions (one step for the group move).
  await ctrlKey("z", "KeyZ", 90);
  D = await waitD((l) => list(l)[0]?.anchors[0].time === l1.anchors[0].time && list(l)[1]?.anchors[0].time === l2.anchors[0].time);
  check(
    "Ctrl+Z undoes the group move",
    list(D)[0]?.anchors[0].time === l1.anchors[0].time && list(D)[1]?.anchors[0].time === l2.anchors[0].time,
    JSON.stringify(list(D).map((d) => d.anchors[0].time)),
  );

  // Ctrl+C / Ctrl+V duplicates the selection (same coordinates), Delete removes the copies.
  await ctrlKey("c", "KeyC", 67);
  await ctrlKey("v", "KeyV", 86);
  D = await waitD((l) => list(l).length === 4);
  const pasted = list(D);
  const sameCoords = pasted.length === 4 && JSON.stringify(pasted[2].anchors) === JSON.stringify(pasted[0].anchors) && pasted[2].id !== pasted[0].id;
  await key("Delete", "Delete", 46);
  D = await waitD((l) => list(l).length === 2);
  check("Ctrl+C / Ctrl+V duplicates the selected drawings", sameCoords && list(D).length === 2, `after paste ${pasted.length}, after Delete ${list(D).length}`);

  // Floating toolbar (single selection) and the drawing menu.
  await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
  await click(mid1.x, mid1.y);
  await waitFor(`document.querySelector(".float-bar")`, 2000);
  const fbButtons = await js(`[...document.querySelectorAll(".float-bar button, .float-bar .fb-grip")].map(b=>b.getAttribute("aria-label")).join(",")`);
  check(
    "floating toolbar shows the per-tool controls",
    /Move toolbar/.test(fbButtons) && /Template/.test(fbButtons) && /Line width/.test(fbButtons) && /Line style/.test(fbButtons) && /More/.test(fbButtons),
    fbButtons,
  );
  await themeBoth("floating-toolbar");
  // Color via the floating toolbar, then Template ▸ Save as… "Red".
  await clickSelector(`.float-bar button[aria-label="Drawing color"]`);
  await sleep(200);
  await clickSelector(`.color-pop button[aria-label="#f23645"]`);
  await sleep(200);
  await key("Escape", "Escape", 27);
  await rightClick(mid1.x, mid1.y);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  const dMenu = await menuLabels();
  await hoverMenu("Visual order");
  await themeBoth("drawing-menu");
  await hoverMenu("Template");
  await clickMenu("Save as");
  await waitFor(`document.querySelector('[role=dialog][aria-label="Save drawing template"]')`, 2000);
  await typeText("Red");
  await key("Enter", "Enter", 13, 0, "\r");
  await sleep(600);
  const tpl = await js(`fetch("/api/drawing-templates").then(r=>r.json())`);
  // Apply it to the second line from its menu.
  await rightClick(mid2.x, mid2.y);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  await hoverMenu("Template");
  const applied = await clickMenu("Red");
  D = await waitD((l) => list(l)[1]?.style?.color === "#f23645");
  check(
    "drawing menu per spec; template Save as… and apply",
    dMenu === "Add alert on trendline… / Template / Visual order / Visibility on intervals / Object tree / Clone / Copy / Lock / Hide / Remove / Settings…" &&
      tpl?.trendline?.saved?.[0]?.name === "Red" && tpl.trendline.saved[0].style.color === "#f23645" && applied && list(D)[1]?.templateName === "Red",
    `menu: ${dMenu} | template ${JSON.stringify(tpl?.trendline?.saved?.[0] ?? null)} | line2 ${list(D)[1]?.style?.color}`,
  );

  // Settings window (schema-driven tabs).
  await rightClick(mid1.x, mid1.y);
  await waitFor(`document.querySelector("[role=menu]")`, 2000);
  await clickMenu("Settings");
  await waitFor(`document.querySelector('[role=dialog][aria-label="Trend line settings"]')`, 3000);
  const tabs = await js(`[...document.querySelectorAll('[role=dialog] [role=tab]')].map(t=>t.textContent).join(",")`);
  const hasExtend = await js(`/Extend right/.test(document.querySelector('[role=dialog]')?.innerText ?? "")`);
  await themeBoth("settings");
  await clickSelector(`[role=dialog] button[data-action=cancel]`);
  check("settings window from the tool schema", tabs === "Style,Text,Coordinates,Visibility" && hasExtend, `${tabs} extend=${hasExtend}`);

  // Toolbar flyout with stars → favorites bar (add, use, remove).
  await clickSelector(`button[aria-label="Trend tools"]`);
  await waitFor(`document.querySelector(".tool-flyout")`, 2000);
  await themeBoth("toolbar-flyout");
  await clickSelector(`.tool-flyout button[aria-label="Add Ray to favorites"]`);
  await sleep(300);
  await key("Escape", "Escape", 27);
  const favShown = await waitFor(`!!document.querySelector('.favorites-bar [data-fav="ray"]')`, 2000);
  await clickSelector(`.favorites-bar [data-fav="ray"]`);
  await sleep(200);
  const rayPressed = await js(`document.querySelector('.favorites-bar [data-fav="ray"]')?.getAttribute("aria-pressed")`);
  await key("Escape", "Escape", 27);
  await clickSelector(`button[aria-label="Trend tools"]`);
  await waitFor(`document.querySelector(".tool-flyout")`, 2000);
  await clickSelector(`.tool-flyout button[aria-label="Remove Ray from favorites"]`);
  await sleep(300);
  await key("Escape", "Escape", 27);
  const favGone = !(await js(`!!document.querySelector(".favorites-bar")`));
  check("favorites bar: star adds, bar activates the tool, unstar removes", Boolean(favShown) && rayPressed === "true" && favGone, `shown=${Boolean(favShown)} pressed=${rayPressed} gone=${favGone}`);

  // Left toolbar geometry: 52×38 buttons with 28×28 icons.
  const sizes = await js(`[...document.querySelectorAll(".draw-toolbar .tool-group")].map(g => { const r = g.getBoundingClientRect(); const s = g.querySelector(".tool-btn svg").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(s.width), Math.round(s.height)].join("x"); })`);
  check("left toolbar buttons are 52×38 with 28×28 icons", sizes.length > 8 && sizes.every((s) => s === "52x38x28x28"), [...new Set(sizes)].join(", "));
  // Every flyout with all its sections, dark and light.
  const groupIds = await js(`[...document.querySelectorAll(".draw-toolbar .tool-group[data-group] .tool-more[data-flyout-toggle]")].map(b => b.closest(".tool-group").dataset.group)`);
  for (const gid of groupIds) {
    await clickSelector(`.draw-toolbar .tool-group[data-group="${gid}"] .tool-more`);
    await waitFor(`!!document.querySelector(".tool-flyout")`, 2000);
    await themeBoth(`flyout-${gid}`);
    await key("Escape", "Escape", 27);
    await sleep(150);
  }
  check("every toolbar group has a flyout", groupIds.length >= 7, groupIds.join(","));

  // Lock all drawings prevents moving.
  D = await dLayout();
  const before = list(D)[0].anchors[0].time;
  await clickSelector(`button[title="Lock all drawings"]`);
  await sleep(200);
  await drag(mid1.x, mid1.y, mid1.x + 90, mid1.y + 20);
  await sleep(1500);
  D = await dLayout();
  const lockedStill = list(D)[0].anchors[0].time === before;
  await clickSelector(`button[title="Lock all drawings"]`);
  await sleep(200);
  check("lock all drawings prevents moving", lockedStill, `t ${before} -> ${list(D)[0].anchors[0].time}`);

  // Object tree: hide, lock and delete from the panel.
  await clickSelector(`button[aria-label="Object tree"]`);
  await waitFor(`document.querySelector('.objtree [data-drawing-id]')`, 3000);
  const [o1, o2] = list(await dLayout());
  await clickSelector(`.objtree-row[data-drawing-id="${o2.id}"] button[aria-label^="Hide"]`);
  await clickSelector(`.objtree-row[data-drawing-id="${o1.id}"] button[aria-label^="Lock"]`);
  D = await waitD((l) => list(l).find((d) => d.id === o2.id)?.hidden === true && list(l).find((d) => d.id === o1.id)?.locked === true);
  const hidLocked = list(D).find((d) => d.id === o2.id)?.hidden === true && list(D).find((d) => d.id === o1.id)?.locked === true;
  await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
  await themeBoth("object-tree");
  await clickSelector(`.objtree-row[data-drawing-id="${o2.id}"] button[aria-label^="Remove"]`);
  D = await waitD((l) => !list(l).some((d) => d.id === o2.id));
  check("object tree hides, locks and deletes drawings", hidLocked && list(D).length === 1, `hidden+locked=${hidLocked} left=${list(D).length}`);

  // 13b. Tool hooks: flyouts list exactly the reference tools, inline text editing, table cells
  // edited in place, position ticks <-> price, choosers on pick (flyout and favorites bar), and an
  // alert on an info line that fires on this server.
  const openGroup = async (gid) => {
    await key("Escape", "Escape", 27);
    await clickSelector(`.draw-toolbar .tool-group[data-group="${gid}"] .tool-more`);
    return waitFor(`!!document.querySelector(".tool-flyout [data-tool]")`, 2000);
  };
  const pickTool = async (gid, type) => {
    await openGroup(gid);
    const ok = await clickSelector(`.tool-flyout [data-tool="${type}"]`);
    await sleep(200);
    return ok;
  };
  const dblClick = async (x, y) => {
    await mouse("mouseMoved", x, y);
    await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", x, y, { clickCount: 1 });
    await mouse("mousePressed", x, y, { buttons: 1, clickCount: 2 });
    await mouse("mouseReleased", x, y, { clickCount: 2 });
  };
  const setInput = (sel, v) =>
    js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("input",{bubbles:true})); return true; })()`);
  const setSelect = (sel, v) =>
    js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("change",{bubbles:true})); return true; })()`);
  const inputVal = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.value ?? null`);
  const editorVal = () => js(`document.querySelector("textarea.inline-text-editor")?.value ?? null`);
  const ofType = (l, type) => list(l).filter((d) => d.type === type);
  // Start from an empty chart.
  await click(P(0.1, 0.1).x, P(0.1, 0.1).y);

  // Flyouts: exactly the reference toolbar items (minus the allow-listed content tools).
  {
    const ref = JSON.parse(fs.readFileSync(path.resolve("web/src/chart/drawings/toolbarGroups.json"), "utf8"));
    const allow = JSON.parse(fs.readFileSync(path.resolve("web/test/drawings/allowlist.json"), "utf8"));
    const want = ref.flatMap((g) => g.sections.flatMap((s) => s.items)).filter((it) => !allow.tools[it] && !(allow.toolbarItems ?? {})[it]).length;
    const gids = await js(`[...document.querySelectorAll(".draw-toolbar .tool-group[data-group] .tool-more[data-flyout-toggle]")].map(b => b.closest(".tool-group").dataset.group).filter(g => g !== "cursors")`);
    const listed = [];
    for (const gid of gids) {
      await openGroup(gid);
      listed.push(...(await js(`[...document.querySelectorAll(".tool-flyout [data-tool]")].map(e => e.dataset.tool)`)));
    }
    await key("Escape", "Escape", 27);
    const hidden = ["arrowMarkLeft", "arrowMarkRight", "textAbsolute", "noteAbsolute", "balloon"].filter((t) => listed.includes(t));
    check("flyouts list exactly the reference tools (hidden tools excluded)", hidden.length === 0 && listed.length === want && listed.includes("arrowMarkUp"), `listed ${listed.length} / reference ${want}; hidden shown: ${hidden.join(",") || "none"}`);
  }

  // Inline text editor: creation, multi-line commit, double-click and Enter re-open it.
  {
    await pickTool("annotation", "text");
    const tp = P(0.62, 0.18);
    await click(tp.x, tp.y);
    const opened = await waitFor(`document.activeElement?.classList.contains("inline-text-editor")`, 3000);
    await typeText("Hello");
    await key("Enter", "Enter", 13, 0, "\r");
    await typeText("World");
    await key("Enter", "Enter", 13, 2);
    D = await waitD((l) => ofType(l, "text").some((d) => d.text === "Hello\nWorld"));
    const stored = ofType(D, "text")[0]?.text;
    await sleep(300);
    await dblClick(tp.x + 14, tp.y + 8);
    const reopened = await waitFor(`document.querySelector("textarea.inline-text-editor")?.value === "Hello" + String.fromCharCode(10) + "World"`, 2000);
    await key("Escape", "Escape", 27);
    await sleep(200);
    const closed = !(await js(`!!document.querySelector("textarea.inline-text-editor")`));
    await click(tp.x + 14, tp.y + 8);
    await sleep(200);
    await key("Enter", "Enter", 13);
    const byEnter = await waitFor(`!!document.querySelector("textarea.inline-text-editor")`, 2000);
    await key("Escape", "Escape", 27);
    await sleep(200);
    check(
      "inline text editing: creation opens the multi-line editor; double-click and Enter re-open it",
      Boolean(opened) && stored === "Hello\nWorld" && Boolean(reopened) && closed && Boolean(byEnter),
      `opened=${Boolean(opened)} text=${JSON.stringify(stored)} dblclick=${Boolean(reopened)} esc=${closed} enter=${Boolean(byEnter)}`,
    );
  }

  // Table: the first cell is edited on creation, another cell by double-clicking it.
  {
    await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
    await pickTool("annotation", "table");
    const tp = P(0.62, 0.42);
    await click(tp.x, tp.y);
    const first = await waitFor(`document.activeElement?.classList.contains("inline-text-editor")`, 3000);
    await typeText("A1");
    await key("Enter", "Enter", 13, 0, "\r");
    D = await waitD((l) => String(ofType(l, "table")[0]?.props?.content ?? "").startsWith("A1"));
    const c1 = String(ofType(D, "table")[0]?.props?.content ?? "");
    await sleep(300);
    await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
    await dblClick(tp.x + 58, tp.y + 44);
    const cellEditor = await waitFor(`document.activeElement?.classList.contains("inline-text-editor")`, 3000);
    const cellValue = await editorVal();
    await typeText("B2");
    await key("Enter", "Enter", 13, 0, "\r");
    D = await waitD((l) => /B2/.test(String(ofType(l, "table")[0]?.props?.content ?? "")));
    const c2 = String(ofType(D, "table")[0]?.props?.content ?? "");
    const row2 = (c2.split("\n")[1] ?? "").split("|").map((s) => s.trim());
    check(
      "table cells are edited in place (creation edits the first cell, double-click another)",
      Boolean(first) && c1.startsWith("A1") && Boolean(cellEditor) && cellValue === "" && row2[1] === "B2",
      `after create: ${JSON.stringify(c1)} | after double-click: ${JSON.stringify(c2)}`,
    );
  }

  // Long position: Inputs ticks <-> price stay in sync and Entry price moves the entry anchor.
  {
    await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
    await pickTool("forecast", "longPosition");
    const p0 = P(0.2, 0.62), p1 = P(0.32, 0.5);
    await drag(p0.x, p0.y, p1.x, p1.y);
    D = await waitD((l) => ofType(l, "longPosition").length === 1);
    const pos = ofType(D, "longPosition")[0];
    await sleep(300);
    await rightClick(P(0.26, 0.6).x, P(0.26, 0.6).y);
    await waitFor(`document.querySelector("[role=menu]")`, 2000);
    await clickMenu("Settings");
    await waitFor(`!!document.querySelector('[role=dialog] [data-field="props.profitLevel"] input')`, 3000);
    const F = (k) => `[role=dialog] [data-field="props.${k}"] input`;
    const entry0 = Number(await inputVal(F("entryPrice")));
    await setInput(F("profitLevel"), 250);
    await sleep(250);
    const price1 = Number(await inputVal(F("profitPrice")));
    // Tick size of the instrument (a power of ten) from the 250-tick target distance.
    const tick = (price1 - entry0) / 250;
    const ticksOk = tick > 0 && Math.abs(Math.log10(tick) - Math.round(Math.log10(tick))) < 1e-6;
    await setInput(F("stopPrice"), String(entry0 - 1.25));
    await sleep(250);
    const stopTicks = Number(await inputVal(F("stopLevel")));
    const entry1 = Number((entry0 + 1).toFixed(2));
    await setInput(F("entryPrice"), String(entry1));
    await sleep(250);
    const price2 = Number(await inputVal(F("profitPrice")));
    await clickSelector(`[role=dialog] button[data-action=ok]`);
    D = await waitD((l) => Math.abs((ofType(l, "longPosition")[0]?.anchors?.[0]?.price ?? 0) - entry1) < 1e-6);
    const after = ofType(D, "longPosition")[0];
    check(
      "long position: ticks <-> price stay in sync, Entry price moves the entry anchor",
      ticksOk && stopTicks === Math.round(1.25 / tick) && Math.abs(price2 - (entry1 + 250 * tick)) < 1e-6 && Math.abs((after?.anchors?.[0]?.price ?? 0) - entry1) < 1e-6 && after?.props?.entryPrice === undefined,
      `entry ${entry0} (anchor ${pos?.anchors?.[0]?.price}) · 250 ticks -> ${price1} · stop ${entry0 - 1.25} -> ${stopTicks} ticks · entry ${entry1} -> target ${price2}, anchor ${after?.anchors?.[0]?.price}`,
    );
  }

  // Choosers: Icon from the flyout (the pick lands in the drawing), Emoji from the favorites bar.
  {
    await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
    await pickTool("icons", "icon");
    const shown = await waitFor(`!!document.querySelector('.icon-picker[data-picker="icon"]')`, 2000);
    await clickSelector(`.icon-picker [data-pick="heart"]`);
    await sleep(200);
    const gone = !(await js(`!!document.querySelector(".icon-picker")`));
    const ip = P(0.78, 0.25);
    await click(ip.x, ip.y);
    D = await waitD((l) => ofType(l, "icon").length === 1);
    const iconProp = ofType(D, "icon")[0]?.props?.icon;
    await openGroup("icons");
    await clickSelector(`.tool-flyout button[aria-label="Add Emoji to favorites"]`);
    await sleep(200);
    await key("Escape", "Escape", 27);
    await waitFor(`!!document.querySelector('.favorites-bar [data-fav="emoji"]')`, 2000);
    await clickSelector(`.favorites-bar [data-fav="emoji"]`);
    const favPicker = await waitFor(`!!document.querySelector('.icon-picker[data-picker="emoji"]')`, 2000);
    await clickSelector(`.icon-picker-cancel`);
    await sleep(200);
    const cancelled = !(await js(`!!document.querySelector(".icon-picker")`));
    await openGroup("icons");
    await clickSelector(`.tool-flyout button[aria-label="Remove Emoji from favorites"]`);
    await sleep(200);
    await key("Escape", "Escape", 27);
    check(
      "tool chooser opens on pick (flyout and favorites bar) and the choice is drawn",
      Boolean(shown) && gone && iconProp === "heart" && Boolean(favPicker) && cancelled,
      `flyout picker=${Boolean(shown)} icon=${iconProp} favorites picker=${Boolean(favPicker)} cancel=${cancelled}`,
    );
  }

  // Alert on an info line: Add alert from its menu, created through the dialog, fires on this server.
  {
    await click(P(0.1, 0.1).x, P(0.1, 0.1).y);
    await pickTool("trend", "infoline");
    const q0 = P(0.12, 0.88), q1 = P(0.24, 0.88);
    await drag(q0.x, q0.y, q1.x, q1.y);
    D = await waitD((l) => ofType(l, "infoline").length === 1);
    const info = ofType(D, "infoline")[0];
    const mid = P(0.18, 0.88);
    await rightClick(mid.x, mid.y);
    await waitFor(`document.querySelector("[role=menu]")`, 2000);
    await clickMenu("Settings");
    await waitFor(`!!document.querySelector('[role=dialog] [data-field="props.extendRight"] input')`, 3000);
    await js(`document.querySelector('[role=dialog] [data-field="props.extendRight"] input').click()`);
    await sleep(150);
    await clickSelector(`[role=dialog] button[data-action=ok]`);
    D = await waitD((l) => ofType(l, "infoline")[0]?.props?.extendRight === true);
    await rightClick(mid.x, mid.y);
    await waitFor(`document.querySelector("[role=menu]")`, 2000);
    const menuText = await menuLabels();
    await clickMenu("Add alert on info line");
    await waitFor(`!!document.querySelector('select[aria-label="Condition 1 operator"]')`, 4000);
    // The operators follow the drawing once the dialog has loaded the layout's drawings.
    await waitFor(`![...document.querySelectorAll('select[aria-label="Condition 1 operator"] option')].some(o => o.value === "enters-channel")`, 4000);
    const ops = await js(`[...document.querySelectorAll('select[aria-label="Condition 1 operator"] option')].map(o => o.value)`);
    const bars = await js(`fetch("/api/bars?symbol=AAPL&interval=1D").then(r=>r.json()).then(j=>j.bars)`);
    const lastClose = bars[bars.length - 1].close;
    const linePrice = info.anchors[1].price + (info.anchors[1].price - info.anchors[0].price) * ((bars[bars.length - 1].time - info.anchors[1].time) / (info.anchors[1].time - info.anchors[0].time || 1));
    const op = lastClose > linePrice ? "greater" : "less";
    await setSelect('select[aria-label="Condition 1 operator"]', op);
    await sleep(150);
    await js(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === "Create")?.click()`);
    let fired = null;
    const end = Date.now() + 25000;
    while (Date.now() < end && !fired) {
      await sleep(1000);
      const alerts = await js(`fetch("/api/alerts").then(r=>r.json())`);
      fired = (Array.isArray(alerts) ? alerts : alerts.alerts ?? []).find((a) => a.conditions?.[0]?.right?.drawingId === info.id && a.lastFiredAt);
    }
    check(
      "alert on an info line (Add alert menu → dialog) fires on the server",
      /Add alert on info line/.test(menuText) && !ops.includes("enters-channel") && Boolean(fired),
      `operators ${ops.join(",")} · ${op} line≈${linePrice.toFixed(2)} close ${lastClose} · fired ${fired ? new Date(fired.lastFiredAt).toISOString() : "no"}`,
    );
    if (fired) await fetch(`${base}/api/alerts/${fired.id}`, { method: "DELETE" }).catch(() => {});
    await key("Escape", "Escape", 27);
  }
}

check("no uncaught page errors", errors.length === 0, errors.slice(0, 5).join(" || "));
fs.writeFileSync(path.join(outDir, "e2e-results.json"), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
ws.close();
process.exit(failed ? 1 : 0);
