// Feature inventory: which of the reference platform's features in catalog.json each compared project offers,
// found by matching the catalog's patterns against its code, file names and READMEs. Pure functions
// (no network, no git) so they can be tested; tools/parity/parity.mjs does the fetching and writing.
import fs from "node:fs";
import path from "node:path";

/** Folders never scanned: dependencies, build output, caches, VCS data. */
export const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target", "vendor", "coverage", ".next", "out", "__pycache__",
  "venv", ".venv", "site-packages", ".turbo", ".cache", "bower_components", "Pods", ".gradle", "obj", "bin",
]);
export const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".rs", ".py", ".go", ".swift", ".kt",
  ".java", ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".dart", ".mq5", ".mqh", ".html", ".json", ".toml",
]);
export const DOC_EXT = new Set([".md", ".mdx", ".rst", ".txt"]);
const SKIP_FILE = /(\.min\.js|\.map|\.snap|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|\.d\.ts)$/i;
export const MAX_FILE_BYTES = 400_000;

/** Ordered: a stronger status wins when results are merged. */
export const STATUS_ORDER = ["no", "claimed", "weak", "yes"];

/** Compile a catalog: one case-insensitive regex per feature. */
export function compileCatalog(catalog) {
  return catalog.features.map((f) => ({ ...f, re: new RegExp(f.patterns.map((p) => `(?:${p})`).join("|"), "i") }));
}

/** Every scannable file under `root` (relative paths with "/"), optionally limited to `include` folders. */
export function listFiles(root, { include = null, exclude = [] } = {}) {
  const out = [];
  const starts = include ? include.map((d) => path.join(root, d)).filter((d) => fs.existsSync(d)) : [root];
  const excluded = exclude.map((e) => path.join(root, e));
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (excluded.some((x) => full === x || full.startsWith(x + path.sep))) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (SKIP_FILE.test(e.name) || !(CODE_EXT.has(ext) || DOC_EXT.has(ext))) continue;
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  starts.forEach(walk);
  return out.sort();
}

/** Docs (READMEs, docs folders, plain text) describe features; everything else is code. */
export function isDoc(rel) {
  return DOC_EXT.has(path.extname(rel).toLowerCase());
}

/** Split camelCase/PascalCase so "heikinAshi" and "HeikinAshiSeries" match "heikin.?ashi" as words. */
export function wordify(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/**
 * Match one file's text (and its path) against the compiled catalog.
 * Returns { featureId: { hits, line } } for the features found, `line` being the first matching line.
 */
export function matchText(compiled, rel, text) {
  const found = {};
  const pathText = wordify(rel.replace(/[/_.-]/g, " "));
  const lines = wordify(text).split(/\r?\n/);
  for (const f of compiled) {
    let hits = 0;
    let first = 0;
    if (f.re.test(pathText)) hits += 3; // a file named after the feature is strong evidence
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 2000) continue; // minified or data blobs
      if (f.re.test(lines[i])) {
        hits++;
        if (!first) first = i + 1;
        if (hits > 50) break;
      }
    }
    if (hits) found[f.id] = { hits, line: first };
  }
  return found;
}

/** Scan a folder. Returns { files, features: { id: { code: [{file,hits,line}], docs: [...] } } }. */
export function scanTree(root, compiled, opts = {}) {
  const files = listFiles(root, opts);
  const features = {};
  for (const rel of files) {
    let text;
    try {
      const st = fs.statSync(path.join(root, rel));
      if (st.size > MAX_FILE_BYTES) continue;
      text = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue; // not checked out (partial clone) or unreadable
    }
    if (text.includes("\u0000")) continue; // binary
    const kind = isDoc(rel) ? "docs" : "code";
    for (const [id, m] of Object.entries(matchText(compiled, rel, text))) {
      const slot = (features[id] ??= { code: [], docs: [] });
      slot[kind].push({ file: rel, hits: m.hits, line: m.line });
    }
  }
  for (const slot of Object.values(features)) {
    slot.code.sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));
    slot.docs.sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));
  }
  return { files: files.length, features };
}

/**
 * How sure we are that a project has a feature: "yes" (found in 2+ code files, or one file with
 * strong evidence), "weak" (one code file), "claimed" (only its docs mention it), "no".
 */
export function featureStatus(slot) {
  if (!slot) return "no";
  const code = slot.code ?? [];
  if (code.length >= 2 || (code.length === 1 && code[0].hits >= 4)) return "yes";
  if (code.length === 1) return "weak";
  return (slot.docs ?? []).length ? "claimed" : "no";
}

/** Counted as offering the feature: found in code (yes or weak) or described in its docs. */
export const offers = (s) => s === "yes" || s === "weak" || s === "claimed";

/**
 * The matrix: per feature, every project's status, our status, and how many projects offer it.
 * `scans` = { repoId: scanTree result }, `ours` = scanTree result of this repo, `overrides` =
 * { featureId: { status, note } } for our own features the patterns cannot see.
 */
export function buildMatrix(catalog, repos, scans, ours, overrides = {}) {
  const features = catalog.features.map((f) => {
    const status = {};
    for (const r of repos) status[r.id] = scans[r.id] ? featureStatus(scans[r.id].features[f.id]) : "n/a";
    const ov = overrides[f.id];
    const oursStatus = ov?.status ?? featureStatus(ours.features[f.id]);
    const offeredBy = repos.filter((r) => offers(status[r.id])).map((r) => r.id);
    return {
      id: f.id,
      cat: f.cat,
      name: f.name,
      ref: f.ref !== false,
      skip: !!f.skip,
      ours: oursStatus,
      oursNote: ov?.note,
      count: offeredBy.length,
      offeredBy,
      status,
    };
  });
  return { features };
}

/** Our gaps: reference-platform features (not skipped) we do not have in code, most common first. */
export function gaps(matrix) {
  return matrix.features
    .filter((f) => f.ref && !f.skip && (f.ours === "no" || f.ours === "claimed"))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** Features we could add that the reference platform lacks (ref: false) but common among the projects. */
export function extras(matrix, min = 2) {
  return matrix.features.filter((f) => !f.ref && !f.skip && f.ours !== "yes" && f.count >= min).sort((a, b) => b.count - a.count);
}

/** What most projects share ("common ground"): features offered by at least `share` of them. */
export function commonGround(matrix, repoCount, share = 0.5) {
  return matrix.features.filter((f) => f.count >= Math.ceil(repoCount * share)).sort((a, b) => b.count - a.count);
}

/** Tests, stories, docs tooling, research notes and examples: worth less than the implementation. */
const SECONDARY_PATH = /(^|\/)(tests?|__tests__|specs?|e2e|docs?|research|stories|storybook|examples?|demos?|fixtures?|scripts|_tools)\/|\.(test|spec|stories)\.[a-z]+$/i;

/** Implementation files first (most hits first), then tests, docs and examples. */
export function rankSourceFiles(files) {
  return [...files].sort((a, b) => Number(SECONDARY_PATH.test(a.file)) - Number(SECONDARY_PATH.test(b.file)) || b.hits - a.hits || a.file.localeCompare(b.file));
}

/**
 * Where to look when building a feature: projects whose code has it. Port-licensed projects list
 * their best files; feature-only projects list only their docs (their code is not to be reused).
 */
export function extractSources(featureId, repos, scans, limit = 5) {
  const out = [];
  for (const r of repos) {
    const slot = scans[r.id]?.features[featureId];
    const st = featureStatus(slot);
    if (st === "no") continue;
    const files = r.reuse === "port" ? rankSourceFiles(slot.code).slice(0, limit) : slot.docs.slice(0, limit);
    out.push({ repo: r.id, name: r.listed, url: `https://github.com/${r.repo}`, license: r.license, reuse: r.reuse, status: st, files });
  }
  const rank = (x) => (x.reuse === "port" ? 0 : 1) * 10 + (3 - STATUS_ORDER.indexOf(x.status));
  return out.sort((a, b) => rank(a) - rank(b) || (b.files[0]?.hits ?? 0) - (a.files[0]?.hits ?? 0));
}

/**
 * Our coverage without any project names, for the repo (docs/parity/coverage.json): per feature our
 * status and how many compared projects offer it. Lets each round compare against the last one.
 */
export function coverage(matrix, repoCount, generated) {
  const inScope = matrix.features.filter((f) => f.ref && !f.skip);
  const have = inScope.filter((f) => f.ours === "yes" || f.ours === "weak").length;
  return {
    generated,
    projects: repoCount,
    inScope: inScope.length,
    have,
    features: matrix.features.map((f) => ({ id: f.id, ours: f.ours, offeredBy: f.count, ...(f.ref ? {} : { ref: false }), ...(f.skip ? { skip: true } : {}) })),
  };
}

/** Our status per feature from the adoption ledger (adopted.json): adopted features count as present. */
export function ledgerOverrides(ledger) {
  const out = {};
  for (const [id, e] of Object.entries(ledger?.features ?? {})) out[id] = { status: "yes", note: e.note ?? `adopted ${e.date ?? ""}`.trim() };
  return out;
}

/** Generic words that are also some project's name: never treated as a name on their own. */
export const GENERIC_WORDS = new Set(["terminal", "chart", "charts", "trader", "trading", "view", "app", "web", "core", "charting"]);

/**
 * The names that must not appear in our code and docs: each project's listed name, owner and repo
 * name, plus the manifest's extra `terms` (the reference platform and its products). Generic words
 * and very short ones are left out.
 */
export function nameTerms(manifest) {
  const terms = new Set();
  const add = (t) => {
    const s = String(t ?? "").trim();
    if (s.length >= 4 && !GENERIC_WORDS.has(s.toLowerCase())) terms.add(s);
  };
  for (const r of manifest.repos ?? []) {
    add(r.listed);
    const [owner, name] = String(r.repo ?? "").split("/");
    add(owner);
    add(name);
  }
  (manifest.terms ?? []).forEach(add);
  return [...terms];
}

/** Lines of `text` that contain one of `terms` as a word (case-insensitive; "-", "_" and spaces are alike). */
export function findNames(text, terms) {
  if (!terms.length) return [];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-_\s]+/g, "[-_\\s]?");
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${terms.map(esc).join("|")})(?![A-Za-z0-9])`, "i");
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const m = re.exec(line);
    if (m) out.push({ line: i + 1, term: m[0] });
  });
  return out;
}

const MARK = { yes: "●", weak: "◐", claimed: "○", no: "·", "n/a": "?" };

/** The Markdown report (local only: it names the projects) written to data/parity/INVENTORY.md. */
export function renderReport(catalog, repos, matrix, { generated, scans }) {
  const L = [];
  const short = repos.map((r, i) => ({ ...r, col: String.fromCharCode(65 + i) }));
  L.push("# Feature inventory: Quant Terminal vs the reference platform and similar projects", "");
  L.push(`Generated ${generated} by \`node tools/parity/parity.mjs index\`. Local only: it names the projects. Do not edit by hand.`, "");
  L.push(
    "Each feature is a public feature name of the reference platform (catalog: `tools/parity/catalog.json`). A project",
    "\"offers\" it when the catalog's patterns match its code (● 2+ files, ◐ one file) or only its docs (○).",
    "Pattern matching is a lead, not proof: confirm in the code before building on a match.",
    "",
  );
  L.push("## Projects", "", "| Col | Project | Repository | License | Reuse | Files scanned |", "|---|---|---|---|---|---|");
  for (const r of short) {
    L.push(`| ${r.col} | ${r.listed} | [${r.repo}](https://github.com/${r.repo}) | ${r.license} | ${r.reuse === "port" ? "code may be adapted" : "features only"} | ${scans[r.id]?.files ?? "not fetched"} |`);
  }
  L.push("");
  const g = gaps(matrix);
  const ours = matrix.features.filter((f) => f.ref && !f.skip);
  const have = ours.filter((f) => f.ours === "yes" || f.ours === "weak").length;
  L.push("## Summary", "");
  L.push(`- Reference-platform features in the catalog (in scope): ${ours.length}`);
  L.push(`- Found in Quant Terminal: ${have} (${Math.round((have / ours.length) * 100)}%)`);
  L.push(`- Gaps: ${g.length}`, "");
  L.push("## Gaps, most common in the other projects first", "");
  L.push("| Feature | Category | Projects offering it | Best sources to adapt |", "|---|---|---|---|");
  for (const f of g) {
    const src = repos.filter((r) => r.reuse === "port" && (f.status[r.id] === "yes" || f.status[r.id] === "weak")).map((r) => r.listed);
    L.push(`| ${f.name} (\`${f.id}\`) | ${catalog.categories[f.cat]} | ${f.count} | ${src.slice(0, 4).join(", ") || "none: build from the public definition"} |`);
  }
  L.push("");
  const ex = extras(matrix);
  if (ex.length) {
    L.push("## Common outside the reference platform (not gaps, ideas)", "");
    for (const f of ex) L.push(`- ${f.name} (\`${f.id}\`): ${f.count} projects`);
    L.push("");
  }
  L.push("## Common ground (offered by half of the projects or more)", "");
  for (const f of commonGround(matrix, repos.length)) L.push(`- ${f.name}: ${f.count}/${repos.length}${f.ours === "yes" || f.ours === "weak" ? "" : " — **missing here**"}`);
  L.push("");
  L.push("## Full matrix", "", `Columns: ${short.map((r) => `${r.col} = ${r.listed}`).join(", ")}.`, "");
  for (const [cat, title] of Object.entries(catalog.categories)) {
    const rows = matrix.features.filter((f) => f.cat === cat);
    if (!rows.length) continue;
    L.push(`### ${title}`, "", `| Feature | Ref | Ours | ${short.map((r) => r.col).join(" | ")} | # |`, `|---|---|---|${short.map(() => "---|").join("")}---|`);
    for (const f of rows) {
      const name = f.skip ? `${f.name} (out of scope)` : f.name;
      L.push(`| ${name} | ${f.ref ? "✓" : ""} | ${MARK[f.ours]}${f.oursNote ? "¹" : ""} | ${short.map((r) => MARK[f.status[r.id]]).join(" | ")} | ${f.count} |`);
    }
    L.push("");
  }
  const notes = matrix.features.filter((f) => f.oursNote);
  if (notes.length) {
    L.push("¹ Adopted (ledger `tools/parity/adopted.json`):", "");
    for (const f of notes) L.push(`- ${f.name}: ${f.oursNote}`);
    L.push("");
  }
  return L.join("\n");
}
