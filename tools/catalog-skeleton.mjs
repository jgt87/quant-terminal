// Prints a DrawingToolDef skeleton for one catalog entry (docs/reference/drawing-tools-catalog.json).
// Usage: node tools/catalog-skeleton.mjs LineToolPitchfork      (or a label: "Pitchfork")
//        node tools/catalog-skeleton.mjs --list [family]        (catalog types, optionally of one family)
// The output is a starting point: rename keys to our storage paths where a shared one exists
// (style.color, style.width, style.lineStyle, style.fillColor, style.textColor, style.textSize,
// style.bold, style.italic, style.levels, text) and keep `catalog:` on every field.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "docs/reference/drawing-tools-catalog.json"), "utf8"));
const arg = process.argv[2];

if (!arg || arg === "--list") {
  const fam = process.argv[3]?.toLowerCase();
  for (const t of catalog) if (!fam || String(t.family).toLowerCase().includes(fam)) console.log(`${t.type.padEnd(34)} ${String(t.family).padEnd(26)} ${t.label}`);
  process.exit(0);
}

const t = catalog.find((x) => x.type === arg || x.label.toLowerCase() === arg.toLowerCase());
if (!t) {
  console.error(`Not in the catalog: ${arg} (try --list)`);
  process.exit(1);
}

// Shared storage paths for the common catalog keys (everything else goes to props.<key>).
const SHARED = {
  linecolor: "style.color",
  color: "style.color",
  linewidth: "style.width",
  linestyle: "style.lineStyle",
  backgroundColor: "style.fillColor",
  textcolor: "style.textColor",
  textColor: "style.textColor",
  fontsize: "style.textSize",
  fontSize: "style.textSize",
  bold: "style.bold",
  italic: "style.italic",
  "text (derived)": "text",
};
const KIND = { width: "width", linestyle: "lineStyle", color: "color", bool: "checkbox", select: "select", font: "fontSize", text: "text", number: "number", levels: "levels" };
const LS = { 0: "solid", 1: "dotted", 2: "dashed" };
const colorOf = (v) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(String(v).trim());
  if (!m) return String(v).toLowerCase();
  const hx = (n) => Math.round(n).toString(16).padStart(2, "0");
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return `#${hx(+m[1])}${hx(+m[2])}${hx(+m[3])}${a < 1 ? hx(a * 255) : ""}`;
};
const ourKey = (k) => SHARED[k] ?? `props.${k.replace(/ \(derived\)$/, "").replace(/\./g, "_")}`;
const value = (f) => (f.type === "linestyle" ? LS[f.default] : f.type === "color" && f.default ? colorOf(f.default) : f.default);

const style = {};
const props = {};
const byTab = {};
const levelPrefixes = new Set();
const tabs = Array.isArray(t.settingsTabs) ? t.settingsTabs : [];
for (const tab of tabs) {
  if (tab.tab === "Visibility" || tab.tab === "Coordinates") continue;
  const tabKey = tab.tab === "Style" ? "style" : tab.tab === "Text" ? "text" : tab.tab === "Inputs" ? "inputs" : `/* custom tab ${tab.tab} */ tabs`;
  const lines = (byTab[tabKey] ??= []);
  for (const f of tab.fields) {
    const lv = /^(level|fanline|arcsLevel|[a-z]*[Ll]evel)(\d+)\.(\w+)$/.exec(f.key);
    if (lv) {
      if (!levelPrefixes.has(lv[1])) {
        levelPrefixes.add(lv[1]);
        lines.push(`      levelTable(${lv[1]}Rows, { catalogPrefix: "${lv[1]}" }), // rows from ${lv[1]}N.coeff / visible / color (/ lineWidth / lineStyle: lineColumns: true)`);
      }
      continue;
    }
    const key = ourKey(f.key);
    const v = value(f);
    if (key.startsWith("style.")) style[key.slice(6)] = v;
    else if (key.startsWith("props.")) props[key.slice(6)] = v;
    const choices =
      f.type === "select" && Array.isArray(f.choices)
        ? ` options: ${JSON.stringify(f.choices.map((c) => ({ value: c.value, label: c.label })))},`
        : f.type === "font" && Array.isArray(f.choices)
          ? ` sizes: ${JSON.stringify(f.choices.map((c) => c.value))},`
          : "";
    lines.push(`      { kind: "${KIND[f.type] ?? f.type}", key: "${key}", label: ${JSON.stringify(f.label)}, catalog: ${JSON.stringify(f.key)},${choices} default: ${JSON.stringify(v)} },${f.group ? ` // group ${f.group}` : ""}`);
  }
}
const coords = tabs.find((x) => x.tab === "Coordinates");
const coordMode = !coords ? "false" : coords.fields.every((f) => f.sub === "price") ? '"price"' : coords.fields.every((f) => f.sub === "bar index") ? '"time"' : '"time-price"';

console.log(`// ${t.label} — ${t.type} (${t.family}; toolbar: ${t.toolbarGroup ?? "?"} / ${t.toolbarSection ?? "?"})
// anchors: ${JSON.stringify(t.anchors)}  hotkey: ${JSON.stringify(t.hotkey?.keys ?? null)}  alert: ${t.contextMenuHasAddAlert === true}
// menu: ${JSON.stringify(t.contextMenuSequence ?? "unknown")}
// notes: ${JSON.stringify(t.notes ?? [])}
export const TOOL: DrawingToolDef = {
  type: "<our-type>",
  catalogType: "${t.type}",
  family: "<family>",
  label: ${JSON.stringify(t.label)},
  icon: "<icon>",
  anchors: ${typeof t.anchors === "number" ? t.anchors : JSON.stringify(t.anchors)},${t.hotkey ? `\n  hotkey: "${t.hotkey.keys.replace(/ /g, "")}",${/here|cursor|immediately/i.test(`${t.hotkey.action} ${t.hotkey.description}`) ? '\n  hotkeyAction: "draw-at-cursor",' : ""}` : ""}${t.contextMenuHasAddAlert ? '\n  alert: "line", // or "band"' : ""}
  floatingToolbar: ${JSON.stringify((Array.isArray(t.floatingToolbar) ? t.floatingToolbar : []).map((b) => b.split(" ")[0].replace(/^toggle-insert-cells-button-Chart\.SelectedObject\.InsertColumnTable$/, "insert-column").replace(/^toggle-insert-cells-button-Chart\.SelectedObject\.InsertRowTable$/, "insert-row")))},
  defaults: ${JSON.stringify(style)},
  defaultProps: ${JSON.stringify(props)},
  settings: {
    coordinates: ${coordMode},
${Object.entries(byTab).map(([k, ls]) => `    ${k}: [\n${ls.join("\n")}\n    ],`).join("\n") || "    style: [],"}
  },${Array.isArray(t.contextMenuExtras) && t.contextMenuExtras.length ? `\n  // menu extras: ${JSON.stringify(t.contextMenuExtras.map((e) => `${e.label} (${e.placement})`))}\n  menuSection: (d, ctx) => [/* … */],` : ""}
  hitTest: (d, g, x, y, tol) => false, // core/src/drawings/<family>.ts
  render: (c, d) => {},
  handles: anchorHandles,
};`);
