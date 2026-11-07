#!/usr/bin/env node
// Feature parity, as a repeatable loop: index the compared projects, find our gaps, extract a work
// packet for one gap, build it, record it in the ledger, and index again to confirm.
//
//   node tools/parity/parity.mjs index [--update] [--no-fetch]   fetch/update the projects and scan
//   node tools/parity/parity.mjs gaps                              our gaps, most common first
//   node tools/parity/parity.mjs extract <feature-id>              work packet in data/parity/work/<id>
//   node tools/parity/parity.mjs adopt <feature-id> --files a,b [--note text] [--ported <project-id>]
//   node tools/parity/parity.mjs status                            coverage now vs the committed one
//   node tools/parity/parity.mjs check-names                       fail on project/product names in our files
//
// Which projects are compared lives only in data/parity/repos.json (git-ignored; the format is in
// tools/parity/repos.example.json), so no project or product name enters the repository. Everything
// that names a project (report, evidence, work packets, clones) stays in data/parity. Committed:
// the catalog, the ledger tools/parity/adopted.json and docs/parity/coverage.json, all name-free.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatrix, compileCatalog, coverage, extractSources, findNames, gaps, ledgerOverrides, nameTerms, renderReport, scanTree } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA = path.join(process.env.QT_DATA_DIR ?? path.join(ROOT, "data"), "parity");
const MANIFEST = path.join(DATA, "repos.json");
const REPOS_DIR = path.join(DATA, "repos");
const WORK_DIR = path.join(DATA, "work");
const EVIDENCE = path.join(DATA, "evidence.json");
const LEDGER = path.join(HERE, "adopted.json");
const COVERAGE = path.join(ROOT, "docs", "parity", "coverage.json");
const LICENSES_DIR = path.join(ROOT, "third_party", "licenses");

/** Our own code: what ships, not docs (they describe planned work too) and not this tool. */
const OUR_SCOPE = { include: ["core/src", "server/src", "web/src", "bridge", "tools"], exclude: ["tools/parity"] };
/** Files the name check skips: required license texts, and the projects' own data. */
const NAME_CHECK_SKIP = [/^third_party\/licenses\//, /^data\//];

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n");
};
const dirOf = (r) => path.join(REPOS_DIR, r.repo.replace("/", "__"));
const today = () => new Date().toISOString().slice(0, 10);
/** A name-free key for a project, used in the ledger and license file names. */
export const sourceKey = (repo) => "src-" + createHash("sha256").update(repo.toLowerCase()).digest("hex").slice(0, 10);

function manifest() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`No project list at ${path.relative(ROOT, MANIFEST)}. Copy tools/parity/repos.example.json there and fill it in.`);
    return null;
  }
  return readJson(MANIFEST);
}
const catalog = () => readJson(path.join(HERE, "catalog.json"));
const ledger = () => (fs.existsSync(LEDGER) ? readJson(LEDGER) : { features: {} });

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim().split("\n").pop() };
}

function fetchRepos(repos, update) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  for (const r of repos) {
    const dir = dirOf(r);
    if (fs.existsSync(path.join(dir, ".git"))) {
      if (!update) continue;
      const res = git(["pull", "--ff-only", "--depth", "1", "-q"], dir);
      console.log(`  ${res.ok ? "updated" : "update failed"}  ${r.id}${res.ok ? "" : `: ${res.err}`}`);
      continue;
    }
    const res = git(["clone", "-q", "--depth", "1", "--single-branch", `https://github.com/${r.repo}.git`, dir], ROOT);
    console.log(`  ${res.ok ? "fetched" : "FAILED "}  ${r.id}${res.ok ? "" : `: ${res.err}`}`);
  }
}

function index(opts) {
  const m = manifest();
  if (!m) return 1;
  const { repos } = m;
  const cat = catalog();
  if (opts.fetch) {
    console.log("Fetching projects...");
    fetchRepos(repos, opts.update);
  }
  const compiled = compileCatalog(cat);
  const scans = {};
  for (const r of repos) {
    const dir = dirOf(r);
    if (!fs.existsSync(dir)) {
      console.log(`  skipped  ${r.id} (not fetched)`);
      continue;
    }
    const t = Date.now();
    scans[r.id] = { ...scanTree(dir, compiled), commit: git(["rev-parse", "--short", "HEAD"], dir).out };
    console.log(`  scanned  ${r.id}: ${scans[r.id].files} files, ${Object.keys(scans[r.id].features).length} features (${Date.now() - t} ms)`);
  }
  const ours = scanTree(ROOT, compiled, OUR_SCOPE);
  console.log(`  scanned  Quant Terminal: ${ours.files} files`);
  const matrix = buildMatrix(cat, repos, scans, ours, ledgerOverrides(ledger()));
  const generated = today();

  writeJson(EVIDENCE, { generated, scans, ours });
  writeJson(path.join(DATA, "inventory.json"), { generated, repos, features: matrix.features });
  fs.writeFileSync(path.join(DATA, "INVENTORY.md"), renderReport(cat, repos, matrix, { generated, scans }) + "\n");
  const prev = fs.existsSync(COVERAGE) ? readJson(COVERAGE) : null;
  const cov = coverage(matrix, repos.length, generated);
  writeJson(COVERAGE, cov);
  console.log(`\nCoverage: ${cov.have}/${cov.inScope} reference features${prev ? ` (was ${prev.have}/${prev.inScope})` : ""}, ${gaps(matrix).length} gaps.`);
  console.log(`Report (local, names projects): ${path.relative(ROOT, path.join(DATA, "INVENTORY.md"))}`);
  return 0;
}

function loadInventory() {
  const f = path.join(DATA, "inventory.json");
  if (!fs.existsSync(f) || !fs.existsSync(EVIDENCE)) {
    console.error("No index yet: run node tools/parity/parity.mjs index first.");
    return null;
  }
  return readJson(f);
}

function listGaps() {
  const inv = loadInventory();
  if (!inv) return 1;
  const adopted = ledger().features;
  for (const f of gaps({ features: inv.features }).filter((g) => !adopted[g.id])) {
    console.log(`${String(f.count).padStart(2)}  ${f.id.padEnd(24)} ${f.name}`);
  }
  return 0;
}

/** Copy a project file into the work packet (port-licensed projects only). */
function copyInto(dest, src) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function findLicense(dir) {
  const f = fs.readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.|$)/i.test(n));
  return f ? path.join(dir, f) : null;
}

function extract(id) {
  const m = manifest();
  const inv = m && loadInventory();
  if (!inv) return 1;
  const f = catalog().features.find((x) => x.id === id);
  if (!f) {
    console.error(`Unknown feature "${id}". Run "gaps" for the ids.`);
    return 1;
  }
  const ev = readJson(EVIDENCE);
  const sources = extractSources(id, m.repos, ev.scans, 6);
  const work = path.join(WORK_DIR, id);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const L = [`# Work packet: ${f.name} (${id})`, "", `Made ${today()} by \`parity.mjs extract\`. Local only: it names projects.`, ""];
  const ours = ev.ours.features[id];
  L.push("## Ours now", "", ours?.code?.length ? ours.code.slice(0, 8).map((x) => `- ${x.file}:${x.line}`).join("\n") : "- nothing found", "");
  L.push("## Sources", "");
  if (!sources.length) L.push("No compared project has it: build it from the public definition.", "");
  for (const s of sources) {
    const r = m.repos.find((x) => x.id === s.repo);
    const port = s.reuse === "port";
    L.push(`### ${s.name} (${s.license}, ${port ? "code may be adapted" : "features only: read its docs, never its code"}) — ${s.status}`, "", s.url, "");
    for (const x of s.files) {
      const rel = path.join("sources", s.repo, x.file);
      copyInto(path.join(work, rel), path.join(dirOf(r), x.file));
      L.push(`- [${x.file}](${rel.split(path.sep).join("/")})${x.line ? ` line ${x.line}` : ""} (${x.hits} hits)`);
    }
    if (port) {
      const lic = findLicense(dirOf(r));
      if (lic) copyInto(path.join(work, "sources", s.repo, "LICENSE.txt"), lic);
      L.push("", `Ported code needs: \`parity.mjs adopt ${id} --files … --ported ${s.repo}\` (stores the license as third_party/licenses/${sourceKey(r.repo)}.txt).`);
    }
    L.push("");
  }
  L.push(
    "## Building it",
    "",
    "1. Read the sources above (and the feature's public definition). Port-licensed code may be adapted; feature-only projects are described, not copied.",
    "2. Build it the Quant Terminal way: pure logic in core/ with tests, rendering in web/src/chart, theme tokens, no project or product names anywhere.",
    "3. Add a CHANGELOG.md line under Unreleased.",
    `4. \`node tools/parity/parity.mjs adopt ${id} --files <our files>\`, then \`index --no-fetch\` and \`check-names\`.`,
    "",
  );
  fs.writeFileSync(path.join(work, "PACKET.md"), L.join("\n"));
  console.log(L.join("\n"));
  console.log(`Work packet: ${path.relative(ROOT, work)}`);
  return 0;
}

function adopt(id, args) {
  const f = catalog().features.find((x) => x.id === id);
  if (!f) {
    console.error(`Unknown feature "${id}".`);
    return 1;
  }
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const files = (opt("--files") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!files.length) {
    console.error("Name the files that implement it: --files core/src/x.ts,web/src/y.ts");
    return 1;
  }
  const missing = files.filter((x) => !fs.existsSync(path.join(ROOT, x)));
  if (missing.length) {
    console.error(`Not found: ${missing.join(", ")}`);
    return 1;
  }
  const entry = { date: today(), files };
  const note = opt("--note");
  if (note) entry.note = note;
  const ported = opt("--ported");
  if (ported) {
    const m = manifest();
    const r = m?.repos.find((x) => x.id === ported);
    if (!r) {
      console.error(`Unknown project "${ported}" (ids are in data/parity/repos.json).`);
      return 1;
    }
    if (r.reuse !== "port") {
      console.error(`That project's license (${r.license}) does not allow adapting its code; build the feature from its description instead.`);
      return 1;
    }
    const lic = fs.existsSync(dirOf(r)) ? findLicense(dirOf(r)) : null;
    if (!lic) {
      console.error("Its license file was not found in the fetched copy; run index first.");
      return 1;
    }
    const key = sourceKey(r.repo);
    fs.mkdirSync(LICENSES_DIR, { recursive: true });
    fs.copyFileSync(lic, path.join(LICENSES_DIR, `${key}.txt`));
    entry.ported = { source: key, license: r.license };
  }
  const l = ledger();
  l.features[id] = entry;
  l.features = Object.fromEntries(Object.entries(l.features).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(LEDGER, l);
  console.log(`Recorded ${id} in tools/parity/adopted.json.`);
  return 0;
}

function status() {
  const inv = loadInventory();
  if (!inv) return 1;
  const cov = readJson(COVERAGE);
  const committed = git(["show", `HEAD:docs/parity/coverage.json`], ROOT);
  const before = committed.ok ? JSON.parse(committed.out) : null;
  console.log(`Coverage: ${cov.have}/${cov.inScope} reference features (index of ${cov.generated}).`);
  if (before) {
    const was = Object.fromEntries(before.features.map((f) => [f.id, f.ours]));
    const changed = cov.features.filter((f) => was[f.id] && was[f.id] !== f.ours);
    console.log(`Committed: ${before.have}/${before.inScope}.${changed.length ? " Changed:" : " No changes."}`);
    for (const f of changed) console.log(`  ${f.id}: ${was[f.id]} → ${f.ours}`);
  }
  console.log(`Adopted: ${Object.keys(ledger().features).length} feature(s).`);
  return 0;
}

function checkNames() {
  const m = manifest();
  if (!m) return 0; // nothing to check against on a machine without the project list
  const terms = nameTerms(m);
  const listed = git(["ls-files", "-co", "--exclude-standard"], ROOT);
  const files = listed.out.split("\n").filter((f) => f && !NAME_CHECK_SKIP.some((re) => re.test(f)));
  let hits = 0;
  for (const rel of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    for (const h of findNames(text, terms)) {
      hits++;
      console.log(`${rel}:${h.line}  "${h.term}"`);
    }
  }
  console.log(hits ? `\n${hits} name(s) found: remove them.` : `No project or product names in ${files.length} files.`);
  return hits ? 1 : 0;
}

const argv = process.argv.slice(2);
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--files", "--note", "--ported"].includes(argv[i - 1])));
const cmd = pos[0] ?? "index";
const run = {
  index: () => index({ fetch: !argv.includes("--no-fetch"), update: argv.includes("--update") }),
  gaps: listGaps,
  extract: () => extract(pos[1] ?? ""),
  adopt: () => adopt(pos[1] ?? "", argv),
  status,
  "check-names": checkNames,
}[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Commands: index, gaps, extract <id>, adopt <id>, status, check-names.`);
  process.exitCode = 1;
} else {
  process.exitCode = run();
}
