// End-to-end checks of the right-side panels (alerts, screener, portfolio, paper, scripts,
// watchlist extras) on the stand-alone panels page (/panels.html), in dark mode, with a
// screenshot per panel in docs/verification/. Creates alerts, portfolios, paper accounts and
// scripts on the server under test: run it against a separate server (QT_DATA_DIR=... PORT=...).
//
//   node tools/e2e-panels.mjs [baseUrl]          (QT_CDP=host:port, default 127.0.0.1:9222)
//
// tools/e2e.mjs also calls runPanelChecks() at its end (skip with QT_E2E_PANELS=0).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** ctx: { send, js, sleep, waitFor, check, shot, base } (the helpers of tools/e2e.mjs). */
export async function runPanelChecks(ctx) {
  const { send, js, sleep, waitFor, check, shot, base } = ctx;
  if (/:(4180|5180)\b/.test(base)) {
    check("panel checks skipped on the live ports", true, "run against a test server");
    return;
  }
  // React-controlled inputs: set through the native setter and fire input/change.
  const setField = (sel, value) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; })()`);
  const press = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const pressText = (sel, text) =>
    js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
  // Open a panel (clicking the open panel's icon would collapse it).
  const rail = (id) => js(`(() => { const b = document.querySelector('.rail-btn[data-panel-id="${id}"]'); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); return !!b; })()`);
  const api = (p, init) => fetch(base + p, init).then((r) => r.json());

  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/panels.html?symbol=AAPL&interval=1D&theme=dark` });
  const hostUp = await waitFor(`document.querySelector(".panel-host .panel-rail") && document.body.innerText.includes("bars")`, 15000);
  check("panels page mounts the panel host and rail", hostUp);
  await waitFor(`/[1-9]\\d* bars/.test(document.querySelector(".harness-top")?.innerText ?? "")`, 15000);

  // ---------- Watchlist extras ----------
  await rail("watchlist");
  await waitFor(`document.querySelector(".wlx-row")`, 10000);
  const firstSym = await js(`document.querySelector(".wlx-row")?.dataset.symbol`);
  const flagNow = () => api("/api/watchlists").then((lists) => lists.find((l) => l.symbols.includes(firstSym))?.flags?.[firstSym] ?? null);
  const waitFlag = async (want) => {
    for (let i = 0; i < 20; i++) {
      if ((await flagNow()) === want) return true;
      await sleep(250);
    }
    return false;
  };
  // Key 4 on a focused row = 4th flag color (green); a click on the dot cycles to the next (cyan).
  await js(`(() => { const r = document.querySelector(".wlx-row"); r.focus(); r.dispatchEvent(new KeyboardEvent("keydown", { key: "4", bubbles: true })); return true; })()`);
  const keyed = await waitFlag("green");
  await press(`.wlx-row .wlx-flag`);
  const cycled = await waitFlag("cyan");
  check("watchlist flags (key 1-7, dot click) are stored in the watchlist JSON", keyed && cycled, `${firstSym}: ${await flagNow()}`);
  await press(`.wlx-flagbtn[title="Only cyan flags"]`);
  const filtered = await waitFor(`[...document.querySelectorAll(".wlx-row")].every((r) => r.querySelector(".wlx-flag.flag-cyan")) && document.querySelectorAll(".wlx-row").length`, 3000);
  check("flag filter shows only flagged symbols", filtered >= 1, `${filtered} rows`);
  await press(`.wlx-flagbtn.all`);
  await press(`.wlx-row[data-symbol="${firstSym}"]`);
  const loadedWl = await waitFor(`document.querySelector('[data-testid=loaded]')?.textContent.includes(${JSON.stringify(firstSym)})`, 3000);
  check("watchlist row click loads the symbol on the chart", loadedWl, firstSym);
  await sleep(1500);
  await shot("panels-watchlist-dark.png");

  // ---------- Alerts: close > 1, then the event/toast ----------
  await setField(`input[aria-label="Harness symbol"]`, "AAPL");
  await rail("alerts");
  await waitFor(`document.querySelector(".al-panel")`, 5000);
  await press(`.al-panel button[title^="New alert"]`);
  await waitFor(`document.querySelector('[role=dialog][aria-label="Create alert"]')`, 5000);
  await setField(`[role=dialog] select[aria-label="Condition 1 operator"]`, "greater");
  await setField(`[role=dialog] input[aria-label="Condition 1 right value"]`, "1");
  await setField(`[role=dialog] input[aria-label="Alert name"]`, "e2e close > 1");
  await setField(`[role=dialog] select[aria-label="Trigger"]`, "once");
  await pressText(`[role=dialog] .dialog-foot button`, "Create");
  await waitFor(`!document.querySelector('[role=dialog][aria-label="Create alert"]')`, 5000);
  const alerts = await api("/api/alerts");
  const created = alerts.find((a) => a.name === "e2e close > 1");
  check(
    "alert dialog creates close > 1",
    created && created.conditions[0].op === "greater" && created.conditions[0].right.value === 1 && created.symbol === "AAPL",
    JSON.stringify(created?.conditions),
  );
  const toast = await waitFor(`[...document.querySelectorAll(".toast")].map((t) => t.innerText).find((t) => t.includes("e2e close > 1"))`, 20000);
  check("fired alert shows an in-app toast (SSE)", toast, String(toast).replace(/\s+/g, " "));
  const events = await api("/api/alerts/events");
  check("alert event is logged", events.some((e) => e.alertId === created?.id), `${events.length} events`);
  const badge = await js(`document.querySelector('.rail-btn[data-panel-id="alerts"] .rail-badge')?.textContent ?? ""`);
  check("unread badge on the alerts rail icon", Number(badge) >= 1, `badge=${badge}`);
  await pressText(`.al-panel .tab`, "Log");
  await waitFor(`document.querySelector(".al-ev")`, 3000);
  await shot("panels-alerts-dark.png");
  await press(`.toast.clickable`);
  const toastLoads = await waitFor(`document.querySelector('[data-testid=loaded]')?.textContent.includes("AAPL")`, 3000);
  check("clicking the toast loads the symbol", toastLoads);

  // ---------- Screener ----------
  await rail("screener");
  await waitFor(`document.querySelector(".sc-panel select[aria-label=Universe] option[value='us-mega']")`, 8000);
  await setField(`.sc-panel select[aria-label=Universe]`, "us-mega");
  await js(`(() => { const b = [...document.querySelectorAll(".sc-panel .sc-filter button")]; b.forEach((x) => x.click()); return true; })()`);
  await sleep(200);
  await pressText(`.sc-panel button`, "+ Filter");
  await sleep(200);
  await setField(`.sc-panel select[aria-label="Filter 1 field"]`, "close");
  await setField(`.sc-panel select[aria-label="Filter 1 operator"]`, ">");
  await setField(`.sc-panel input[aria-label="Filter 1 value"]`, "1");
  await press(`.sc-panel .sp-run, .sc-panel .btn.primary`);
  const rows = await waitFor(`document.querySelectorAll(".sc-table tbody tr").length`, 60000);
  const summary = await js(`document.querySelector(".sc-summary")?.textContent ?? ""`);
  check("screener runs with a filter (close > 1)", rows > 0 && /computed/.test(summary), `${rows} rows · ${summary}`);
  await shot("panels-screener-dark.png");

  // ---------- Portfolio ----------
  await rail("portfolio");
  await waitFor(`document.querySelector(".pf-panel")`, 5000);
  const hasPf = await js(`!!document.querySelector(".pf-panel select[aria-label=Portfolio] option[value]:not([value=''])")`);
  if (!hasPf) {
    await pressText(`.pf-panel button`, "Create a portfolio");
    await waitFor(`document.querySelector('[role=dialog][aria-label="New portfolio"]')`, 3000);
    await setField(`[role=dialog] input[aria-label="Starting cash"]`, "10000");
    await pressText(`[role=dialog] .dialog-foot button`, "OK");
  }
  await waitFor(`document.querySelector(".pf-panel .pn-tabs")`, 5000);
  const pfId = await js(`document.querySelector(".pf-panel select[aria-label=Portfolio]")?.value`);
  const qtyOf = async () => (pfId ? ((await api(`/api/portfolios/${pfId}/holdings`)).holdings ?? []).find((h) => h.symbol === "AAPL")?.qty ?? 0 : 0);
  const qty0 = await qtyOf();
  await pressText(`.pf-panel .tab`, "Transactions");
  await waitFor(`document.querySelector(".pf-txform")`, 3000);
  await setField(`.pf-txform input[aria-label=Symbol]`, "AAPL");
  await setField(`.pf-txform input[aria-label=Quantity]`, "10");
  await setField(`.pf-txform input[aria-label=Price]`, "100");
  await pressText(`.pf-txform button`, "Add");
  await waitFor(`document.querySelector(".pf-txs tbody tr")`, 5000);
  await pressText(`.pf-panel .tab`, "Holdings");
  const want = qty0 + 10;
  const holding = await waitFor(`(() => { const r = document.querySelector('.pf-holdings tr[data-symbol="AAPL"]'); return r && r.cells[1].textContent.replace(/,/g, "") === "${want}" && r.innerText; })()`, 15000);
  const totals = await waitFor(`(() => { const t = document.querySelector(".pf-totals")?.innerText ?? ""; return /Equity\\s*[\\d,]+\\./i.test(t) && t; })()`, 15000);
  check("portfolio transaction shows up in holdings and totals", holding && totals && (await qtyOf()) === want, `${String(holding).replace(/\s+/g, " ")} | ${String(totals).replace(/\s+/g, " ")}`);
  const donut = await js(`document.querySelectorAll(".pf-donut circle").length`);
  check("allocation donut drawn", donut >= 2, `${donut} circles`);
  await shot("panels-portfolio-dark.png");

  // ---------- Paper trading ----------
  await rail("paper");
  await waitFor(`document.querySelector(".pp-panel")`, 5000);
  const labelled = await js(`document.querySelector(".pp-panel")?.innerText.includes("Paper (simulated)")`);
  if (await js(`!document.querySelector(".pp-ticket")`)) {
    await pressText(`.pp-panel button`, "Create a paper");
    await waitFor(`document.querySelector('[role=dialog]')`, 3000);
    await pressText(`[role=dialog] .dialog-foot button`, "OK");
  }
  await waitFor(`document.querySelector(".pp-ticket")`, 5000);
  const accId = await js(`document.querySelector(".pp-panel select[aria-label='Paper account']")?.value`);
  const paperQty = async () => (accId ? (await api(`/api/paper/${accId}`)).positions?.AAPL?.qty ?? 0 : 0);
  const pq0 = await paperQty();
  await setField(`.pp-ticket input[aria-label="Order symbol"]`, "AAPL");
  await setField(`.pp-ticket input[aria-label="Order quantity"]`, "3");
  await setField(`.pp-ticket select[aria-label="Order type"]`, "market");
  await press(`.pp-ticket .pp-submit`);
  const pos = await waitFor(`(() => { const r = document.querySelector('.pp-positions tr[data-symbol="AAPL"]'); return r && r.cells[1].textContent === "${pq0 + 3}" && r.innerText; })()`, 15000);
  check("paper market order opens a position", pos && (await paperQty()) === pq0 + 3, `${String(pos).replace(/\s+/g, " ")} | labelled=${labelled}`);
  await sleep(2500);
  await shot("panels-paper-dark.png");

  // ---------- Scripts ----------
  await rail("scripts");
  await waitFor(`document.querySelector(".sp-panel")`, 5000);
  await setField(`.sp-panel select[aria-label="Open script"]`, "example:example-sma-ribbon");
  await waitFor(`document.querySelector(".sp-panel input[aria-label='Script name']")?.value === "SMA ribbon"`, 3000);
  await press(`.sp-panel .sp-run`);
  const plotRows = await waitFor(`document.querySelectorAll(".sp-plots tr[data-plot]").length >= 6 && document.querySelectorAll(".sp-plots tr[data-plot]").length`, 15000);
  const runInfo = await js(`document.querySelector(".sp-ok")?.textContent ?? document.querySelector(".sp-error")?.textContent ?? ""`);
  check("SMA-ribbon example runs in the worker and lists its outputs", plotRows === 6, `${plotRows} plots · ${runInfo}`);
  await pressText(`.sp-panel button`, "Add to chart");
  const onChart = await waitFor(`document.querySelector('[data-testid=plots]')?.textContent.includes("sma60")`, 3000);
  check("script plots handed to the chart (onAddScriptPlots)", onChart);
  // A runaway script is stopped after 2 s.
  await setField(`.sp-panel textarea.code-input`, "while (true) {}");
  await press(`.sp-panel .sp-run`);
  const stopped = await waitFor(`document.querySelector(".sp-error")?.textContent.includes("longer than 2 s")`, 8000);
  check("runaway script is terminated after 2 s", stopped);
  await setField(`.sp-panel select[aria-label="Open script"]`, "example:example-sma-ribbon");
  await sleep(300);
  await press(`.sp-panel .sp-run`);
  await waitFor(`document.querySelectorAll(".sp-plots tr[data-plot]").length >= 6`, 15000);
  await shot("panels-scripts-dark.png");

  // Clean up what the run created on the test server.
  if (created) await fetch(`${base}/api/alerts/${created.id}`, { method: "DELETE" }).catch(() => {});
}

// ---------- Stand-alone run ----------
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const base = process.argv[2] ?? "http://localhost:4185";
  const cdpHost = process.env.QT_CDP ?? "127.0.0.1:9222";
  const outDir = path.resolve("docs/verification");
  fs.mkdirSync(outDir, { recursive: true });
  const target = await fetch(`http://${cdpHost}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
      return;
    }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed");
    return r.result?.result?.value;
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
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, "base64"));
  };
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await runPanelChecks({ send, js, sleep, waitFor, check, shot, base });
  check("no uncaught page errors", errors.length === 0, errors.slice(0, 5).join(" || "));
  fs.writeFileSync(path.join(outDir, "e2e-panels-results.json"), JSON.stringify({ at: new Date().toISOString(), base, results, errors }, null, 2));
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  ws.close();
  await fetch(`http://${cdpHost}/json/close/${target.id}`).catch(() => {});
  process.exit(failed ? 1 : 0);
}
