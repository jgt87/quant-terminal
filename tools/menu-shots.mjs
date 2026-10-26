// Screenshot sheet of every menu and dialog (visual-language check).
// Usage: QT_CDP=127.0.0.1:9338 node tools/menu-shots.mjs <cdpTargetId> <baseUrl> <suffix> [themes]
// Writes docs/verification/menus-<name>-<suffix>[-light].png. Run against a test server only.
import fs from "node:fs";
import path from "node:path";

const [, , target, base = "http://localhost:4189", suffix = "after", themes = "dark"] = process.argv;
if (/:(4180|5180)\b/.test(base)) throw new Error("menu-shots resets the workspace: use a test server");
const outDir = path.resolve("docs/verification");
fs.mkdirSync(outDir, { recursive: true });
const ws = new WebSocket(`ws://${process.env.QT_CDP ?? "127.0.0.1:9222"}/devtools/page/${target}`);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: 0, clickCount: 1, ...extra });
const click = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1 }); await mouse("mouseReleased", x, y); };
const rightClick = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { button: "right", buttons: 2 }); await mouse("mouseReleased", x, y, { button: "right" }); };
const key = async (k, code, vk, modifiers = 0) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const rectOf = (sel) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,l:r.x,t:r.y}; })()`);
const clickSel = async (sel) => { const r = await rectOf(sel); if (r) await click(r.x, r.y); return Boolean(r); };
const escape = async () => { await key("Escape", "Escape", 27); await sleep(150); await key("Escape", "Escape", 27); await sleep(200); };
const theme = (t) => js(`(() => { const b=document.querySelector('button[aria-label="Switch to ${t} theme"]'); b?.click(); return !!b; })()`);
const shots = [];
const shot = async (name) => {
  for (const t of themes.split(",")) {
    if (t === "light") { await theme("light"); await sleep(400); }
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = `menus-${name}-${suffix}${t === "light" ? "-light" : ""}.png`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, "base64"));
    shots.push(file);
    if (t === "light") { await theme("dark"); await sleep(400); }
  }
};

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
const L = "menu-shots";
await fetch(`${base}/api/layouts/${L}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: L, name: "Menus", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [{ uid: "rsi1", indicatorId: "rsi", inputs: { length: 14 }, visible: true }], drawings: { AAPL: [] }, updatedAt: Date.now() }) });
await fetch(`${base}/api/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "default", tabs: [{ id: "m1", name: "Menus", grid: "1", cells: [{ layoutId: L }] }], activeTab: "m1", crosshairSync: false, updatedAt: Date.now() }) });
await send("Page.navigate", { url: `${base}/?layout=${L}` });
await sleep(1500);
for (let i = 0; i < 40 && !(Number(await js(`document.querySelector(".chart-view")?.dataset.bars`)) > 50); i++) await sleep(300);
await sleep(800);
const c = await js(`(() => { const r=document.querySelector(".grid-cell .chart-host").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);

// Chart background menu.
await rightClick(c.x + c.w * 0.45, c.y + c.h * 0.15);
await sleep(300);
await shot("chart");
await escape();
// Price axis menu.
await rightClick(c.x + c.w - 25, c.y + c.h * 0.3);
await sleep(300);
await shot("price-axis");
await escape();
// Indicator menu (legend row).
const ind = await rectOf(".legend-ind");
if (ind) {
  await rightClick(ind.l + 20, ind.y);
  await sleep(300);
  await shot("indicator");
  await escape();
}
// Watchlist row menu.
await js(`(() => { const b=document.querySelector('.rail-btn[data-panel-id="watchlist"]'); if (b && b.getAttribute("aria-pressed")!=="true") b.click(); })()`);
await sleep(800);
const row = await rectOf(".wlx-row");
if (row) {
  await rightClick(row.x, row.y);
  await sleep(300);
  await shot("watchlist");
  await escape();
}
// Drawing menu + floating toolbar + settings window: draw a horizontal line.
await click(c.x + c.w * 0.5, c.y + c.h * 0.5);
await mouse("mouseMoved", c.x + c.w * 0.4, c.y + c.h * 0.4);
await key("h", "KeyH", 72, 1);
await sleep(300);
await click(c.x + c.w * 0.4, c.y + c.h * 0.4);
await sleep(500);
await shot("floating-toolbar");
await rightClick(c.x + c.w * 0.2, c.y + c.h * 0.4);
await sleep(300);
const sub = await js(`(() => { const it=[...document.querySelectorAll("[role=menu] [role=menuitem]")].find(e=>/Visual order/.test(e.textContent)); if(!it) return null; const r=it.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
if (sub) { await mouse("mouseMoved", sub.x, sub.y); await sleep(300); }
await shot("drawing");
await escape();
await rightClick(c.x + c.w * 0.2, c.y + c.h * 0.4);
await sleep(300);
await js(`[...document.querySelectorAll("[role=menu] [role=menuitem]")].find(e=>/^Settings/.test(e.textContent.trim()))?.click()`);
await sleep(500);
await shot("drawing-settings");
await js(`document.querySelector('[role=dialog] button[data-action=cancel]')?.click()`);
await sleep(300);
// Chart settings and indicator settings windows.
await clickSel(`button[aria-label="Chart settings"]`);
await sleep(500);
await shot("chart-settings");
await js(`document.querySelector('[role=dialog] button[data-action=cancel]')?.click()`);
await sleep(300);
if (ind) {
  await rightClick(ind.l + 20, ind.y);
  await sleep(300);
  await js(`[...document.querySelectorAll("[role=menu] [role=menuitem]")].find(e=>/^Settings/.test(e.textContent.trim()))?.click()`);
  await sleep(500);
  await shot("indicator-settings");
  await js(`document.querySelector('[role=dialog] button[data-action=cancel]')?.click()`);
  await sleep(300);
}
// Toolbar dropdown (chart type) and a panel menu (alerts).
await clickSel(`button[title="Chart type"]`);
await sleep(300);
await shot("dropdown");
await escape();
// Confirm dialog: closing the last tab asks first.
await click(c.x + c.w * 0.5, c.y + c.h * 0.6);
await key("w", "KeyW", 87, 1);
await sleep(500);
await shot("confirm");
await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>/Cancel/.test(b.textContent))?.click()`);
await sleep(200);
console.log(shots.join("\n"));
ws.close();
