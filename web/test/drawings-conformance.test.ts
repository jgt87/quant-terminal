// Drawing-tool conformance harness (docs/DRAWING-TOOLS.md §6). Scope:
// - default (plain `vitest run`): the 13 tools that existed before the registry (core scope);
// - `npm run test:drawings` → every catalog tool and every registered tool (QT_DRAWINGS_SCOPE=all);
// - `npm run test:drawings -- --family fibonacci` / `-- --tool fib,ray`.
// With a scope set it writes docs/verification/drawings-coverage[-<family>].md.

import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { allTools } from "../src/chart/drawings/registry";
import type { DrawingToolDef } from "../src/chart/drawings/types";
import { ALLOW, CATALOG, coverage, familyOf, reachFieldCount, smoke, toolbarGaps, toolFor, uiReach, wiring, type CatalogTool, type FieldReport, type Gap } from "./drawings/harness";

const CORE = ["trendline", "ray", "extended", "hline", "hray", "vline", "rectangle", "channel", "fib", "measure", "text", "vprofile", "avprofile"];
const scope = process.env.QT_DRAWINGS_SCOPE ?? "";
const family = process.env.QT_DRAWINGS_FAMILY ?? "";
const toolList = (process.env.QT_DRAWINGS_TOOL ?? "").split(",").filter(Boolean);

let tools: DrawingToolDef[];
let catalog: CatalogTool[];
if (toolList.length) {
  tools = allTools().filter((t) => toolList.includes(t.type));
  catalog = CATALOG.filter((c) => tools.some((t) => t.catalogType === c.type));
} else if (family) {
  tools = allTools().filter((t) => t.family === family);
  catalog = CATALOG.filter((c) => familyOf(c) === family || tools.some((t) => t.catalogType === c.type));
} else if (scope === "all") {
  tools = allTools();
  catalog = CATALOG;
} else {
  tools = allTools().filter((t) => CORE.includes(t.type));
  catalog = CATALOG.filter((c) => tools.some((t) => t.catalogType === c.type));
}

interface Row {
  catalogType: string;
  label: string;
  tool: string;
  fields: string;
  wired: string;
  gaps: number;
}
const rows: Row[] = [];
const allGaps: Gap[] = [];
const exempt: string[] = [];
const nonVisual: string[] = [];
let fieldsOk = 0;
let fieldsTotal = 0;
let wiredOk = 0;
let wiredTotal = 0;
let reachOk = 0;
let reachTotal = 0;
let smokeOk = 0;

describe("catalog coverage", () => {
  for (const cat of catalog) {
    const allowed = ALLOW.tools[cat.type];
    it(`${cat.label} (${cat.type})`, () => {
      if (allowed) {
        rows.push({ catalogType: cat.type, label: cat.label, tool: `allow-listed: ${allowed}`, fields: "–", wired: "–", gaps: 0 });
        return;
      }
      const report: FieldReport = { total: 0, ok: 0, exempt };
      const gaps = coverage(cat, report);
      fieldsOk += report.ok;
      fieldsTotal += report.total;
      allGaps.push(...gaps);
      rows.push({ catalogType: cat.type, label: cat.label, tool: toolFor(cat.type)?.type ?? "NOT REGISTERED", fields: `${report.ok}/${report.total}`, wired: "", gaps: gaps.length });
      expect(gaps.map((g) => `${g.kind}: ${g.detail}`)).toEqual([]);
    });
  }
});

describe("settings wiring", () => {
  for (const def of tools) {
    it(`${def.label} (${def.type})`, () => {
      const w = wiring(def);
      wiredOk += w.wired;
      wiredTotal += w.total;
      nonVisual.push(...w.nonVisual);
      allGaps.push(...w.gaps);
      const row = rows.find((r) => r.tool === def.type);
      if (row) {
        row.wired = `${w.wired}/${w.total}`;
        row.gaps += w.gaps.length;
      } else rows.push({ catalogType: def.catalogType ?? "–", label: def.label, tool: def.type, fields: "–", wired: `${w.wired}/${w.total}`, gaps: w.gaps.length });
      expect(w.gaps.map((g) => g.detail)).toEqual([]);
    });
  }
});

describe("settings window reachability", () => {
  for (const def of tools) {
    it(`${def.label} (${def.type})`, () => {
      const gaps = uiReach(def);
      const n = reachFieldCount(def);
      reachTotal += n;
      reachOk += Math.max(0, n - gaps.length);
      allGaps.push(...gaps);
      const row = rows.find((r) => r.tool === def.type);
      if (row) row.gaps += gaps.length;
      expect(gaps.map((g) => g.detail)).toEqual([]);
    });
  }
});

describe("interaction smoke", () => {
  for (const def of tools) {
    it(`${def.label} (${def.type})`, () => {
      const out = smoke(def);
      if (!out.length) smokeOk++;
      allGaps.push(...out.map((detail) => ({ tool: def.type, kind: "smoke", detail })));
      const row = rows.find((r) => r.tool === def.type);
      if (row) row.gaps += out.length;
      expect(out).toEqual([]);
    });
  }
});

if (scope === "all" && !family && !toolList.length) {
  describe("left toolbar", () => {
    it("every reference toolbar item maps to a registered tool or an allow-listed exclusion, in reference order", () => {
      const gaps = toolbarGaps();
      allGaps.push(...gaps);
      expect(gaps.map((g) => g.detail)).toEqual([]);
    });
  });
}

afterAll(() => {
  if (!scope && !family && !toolList.length) return;
  const registered = catalog.filter((c) => toolFor(c.type) && !ALLOW.tools[c.type]).length;
  const allowed = catalog.filter((c) => ALLOW.tools[c.type]).length;
  const lines = [
    `# Drawing tools conformance${family ? ` — ${family}` : toolList.length ? ` — ${toolList.join(", ")}` : ""}`,
    "",
    `Generated by \`npm run test:drawings${family ? ` -- --family ${family}` : ""}\` on ${new Date().toISOString().slice(0, 10)} from docs/reference/drawing-tools-catalog.json.`,
    "",
    `- Catalog tools registered: **${registered} / ${catalog.length - allowed}** (${allowed} allow-listed out of scope)`,
    `- Catalog fields wired with tab, type, choices and factory default: **${fieldsOk} / ${fieldsTotal}**`,
    `- Settings that change the rendering (wiring test incl. coordinates and visibility): **${wiredOk} / ${wiredTotal}**`,
    `- Settings fields reachable in the settings window (control rendered, value stored): **${reachOk} / ${reachTotal}**`,
    `- Tools passing the interaction smoke test (create, hit / miss, handle drags, menu, tabs, JSON round trip): **${smokeOk} / ${tools.length}**`,
    `- Gaps: **${allGaps.length}**`,
    "",
    "| Catalog type | Label | Tool | Catalog fields | Wired | Gaps |",
    "|---|---|---|---|---|---|",
    ...rows.sort((a, b) => a.catalogType.localeCompare(b.catalogType)).map((r) => `| ${r.catalogType} | ${r.label} | ${r.tool} | ${r.fields} | ${r.wired || "–"} | ${r.gaps} |`),
    "",
    "## Gaps",
    "",
    ...(allGaps.length ? allGaps.map((g) => `- \`${g.tool}\` ${g.kind}: ${g.detail}`) : ["None."]),
    "",
    "## Exempt (unknown in the catalog)",
    "",
    ...(exempt.length ? [...new Set(exempt)].map((e) => `- ${e}`) : ["None."]),
    "",
    "## Fields tagged non-visual",
    "",
    ...(nonVisual.length ? nonVisual.map((e) => `- ${e}`) : ["None."]),
    "",
  ];
  const out = path.resolve(__dirname, `../../docs/verification/drawings-coverage${family ? `-${family}` : ""}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join("\n"));
});
