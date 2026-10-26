// Screenshot sheets of the drawing tools: one chart per family with every tool of the family
// drawn (dark above, light below) → docs/verification/drawings-<family>.png, and every left-toolbar
// flyout with all its tools (dark and light) → docs/verification/drawings-flyouts.png.
// Usage: QT_CDP=127.0.0.1:9345 node tools/drawing-sheets.mjs <cdpTargetId> <baseUrl> [family,...]
// Run against a test server only (it replaces the workspace and writes its own layouts).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [, , target, base = "http://localhost:4198", only = ""] = process.argv;
if (/:(4180|5180)\b/.test(base)) throw new Error("drawing-sheets replaces the workspace: use a test server");
const outDir = path.resolve("docs/verification");
const specs = JSON.parse(execSync("npx tsx tools/drawing-specs.ts", { encoding: "utf8", maxBuffer: 64 << 20 }));

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
const key = async (k, code, vk) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
};
const rectOf = (sel) => js(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
const capture = async (clip) => (await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).result.data;
const theme = async (t) => {
  await js(`document.querySelector('button[aria-label="Switch to ${t} theme"]')?.click()`);
  await sleep(500);
};
/** Stacks / tiles base64 PNGs in the page (canvas) with captions; returns base64 PNG. */
const compose = (tiles, cols) =>
  js(`(async () => {
    const tiles = ${JSON.stringify(tiles)};
    const imgs = await Promise.all(tiles.map((t) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + t.png; })));
    const cols = ${cols};
    const cap = 26;
    const rows = Math.ceil(imgs.length / cols);
    const colW = Array.from({ length: cols }, (_, c) => Math.max(...imgs.filter((_, i) => i % cols === c).map((i) => i.width)));
    const rowH = Array.from({ length: rows }, (_, r) => Math.max(...imgs.slice(r * cols, r * cols + cols).map((i) => i.height)) + cap);
    const cv = document.createElement("canvas");
    cv.width = colW.reduce((a, b) => a + b, 0) + 8 * (cols + 1);
    cv.height = rowH.reduce((a, b) => a + b, 0) + 8 * (rows + 1);
    const g = cv.getContext("2d");
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue("--panel").trim() || "#1e222d";
    g.fillRect(0, 0, cv.width, cv.height);
    g.font = "600 14px sans-serif";
    g.textBaseline = "middle";
    let y = 8;
    for (let r = 0; r < rows; r++) {
      let x = 8;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i >= imgs.length) break;
        g.fillStyle = css.getPropertyValue("--text").trim() || "#d1d4dc";
        g.fillText(tiles[i].caption, x + 2, y + cap / 2);
        g.drawImage(imgs[i], x, y + cap);
        x += colW[c] + 8;
      }
      y += rowH[r] + 8;
    }
    return cv.toDataURL("image/png").slice(22);
  })()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
const barsRes = await (await fetch(`${base}/api/bars?symbol=AAPL&interval=1D`)).json();
const bars = barsRes.bars;
const n = bars.length;

// ---------- drawings per family ----------

/** Anchors / points of a tool inside a cell (bar index range i0..i1, price range lo..hi). */
function geometry(t, i0, i1, lo, hi) {
  const time = (f) => bars[Math.max(0, Math.min(n - 1, Math.round(i0 + (i1 - i0) * f)))].time;
  const price = (f) => lo + (hi - lo) * f;
  const A = (fx, fy) => ({ time: time(fx), price: price(fy) });
  if (t.anchors === "freehand" || t.anchors === "poly") {
    const pts = Array.from({ length: 9 }, (_, k) => A(k / 8, 0.5 + 0.3 * Math.sin((k / 8) * Math.PI * 2)));
    return { anchors: [], points: pts };
  }
  const k = t.anchors;
  if (k === 1) return { anchors: [A(0.5, 0.5)] };
  if (t.type === "shortPosition") return { anchors: [A(0.1, 0.6), A(0.9, 0.3)] };
  if (t.type === "longPosition") return { anchors: [A(0.1, 0.4), A(0.9, 0.7)] };
  if (k === 2) return { anchors: [A(0.1, 0.2), A(0.9, 0.8)] };
  return { anchors: Array.from({ length: k }, (_, j) => A(j / (k - 1), j % 2 ? 0.8 : 0.2 + 0.1 * (j / k))) };
}

function familyDrawings(family) {
  const tools = specs.tools.filter((t) => t.family === family);
  const visible = bars.slice(n - 120, n - 4);
  const lo = Math.min(...visible.map((b) => b.low));
  const hi = Math.max(...visible.map((b) => b.high));
  const cols = Math.max(1, Math.ceil(Math.sqrt(tools.length * 1.6)));
  const rows = Math.ceil(tools.length / cols);
  const span = 116 / cols;
  return tools.map((t, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const i0 = n - 120 + c * span + span * 0.12;
    const i1 = n - 120 + (c + 1) * span - span * 0.12;
    const h = (hi - lo) / rows;
    const top = hi - r * h;
    const g = geometry(t, i0, i1, top - h * 0.85, top - h * 0.15);
    const d = { id: `sheet-${t.type}`, type: t.type, ...g, style: structuredClone(t.defaults ?? {}), props: structuredClone(t.defaultProps ?? {}) };
    if (t.defaultText !== undefined) d.text = t.label;
    if (t.type === "table") d.props = { ...d.props, content: "Tool | Table\nRow | 2" };
    return d;
  });
}

const families = [...new Set(specs.tools.map((t) => t.family))].filter((f) => !only || only.split(",").includes(f));
const written = [];
for (const family of families) {
  const L = `sheet-${family}`;
  await fetch(`${base}/api/layouts/${L}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: L, name: family, symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: { AAPL: familyDrawings(family) }, updatedAt: Date.now() }),
  });
  await fetch(`${base}/api/workspace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "default", tabs: [{ id: "sheet", name: "Sheet", grid: "1", cells: [{ layoutId: L }] }], activeTab: "sheet", crosshairSync: false, updatedAt: Date.now() }),
  });
  // Mark the old page so the wait below only passes on the new one.
  await js(`window.__sheetOld = true`);
  await send("Page.navigate", { url: `${base}/?layout=${L}` });
  await sleep(1200);
  for (let i = 0; i < 150 && !(await js(`!window.__sheetOld && Number(document.querySelector(".chart-view")?.dataset.bars) > 50`)); i++) await sleep(300);
  await sleep(900);
  // Pointer away from the chart (no crosshair, no hover).
  await mouse("mouseMoved", 2, 2);
  const clip = await rectOf(".grid-cell");
  const dark = await capture(clip);
  await theme("light");
  const light = await capture(clip);
  await theme("dark");
  const labels = specs.tools.filter((t) => t.family === family).map((t) => t.label).join(", ");
  const png = await compose([{ caption: `${family} — dark: ${labels}`, png: dark }, { caption: `${family} — light`, png: light }], 1);
  const file = `drawings-${family}.png`;
  fs.writeFileSync(path.join(outDir, file), Buffer.from(png, "base64"));
  written.push(file);
  console.log(file);
}

// ---------- every flyout, dark and light ----------

if (!only) {
  // Tall enough for the longest flyout (no scrolling inside it).
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await mouse("mouseMoved", 2, 2);
  const tiles = [];
  for (const t of ["dark", "light"]) {
    if (t === "light") await theme("light");
    for (const g of specs.groups) {
      await key("Escape", "Escape", 27);
      const more = await rectOf(`.draw-toolbar .tool-group[data-group="${g.id}"] .tool-more`);
      if (!more) continue;
      await click(more.x + more.width / 2, more.y + more.height / 2);
      await sleep(300);
      await mouse("mouseMoved", 2, 2);
      const fly = await rectOf(".tool-flyout");
      if (!fly) continue;
      tiles.push({ caption: `${g.label} (${t})`, png: await capture(fly) });
    }
    await key("Escape", "Escape", 27);
    if (t === "light") await theme("dark");
  }
  const png = await compose(tiles, specs.groups.length);
  fs.writeFileSync(path.join(outDir, "drawings-flyouts.png"), Buffer.from(png, "base64"));
  written.push("drawings-flyouts.png");
  console.log("drawings-flyouts.png");
}
ws.close();
