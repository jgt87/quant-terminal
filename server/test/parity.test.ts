import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMatrix,
  compileCatalog,
  coverage,
  extractSources,
  featureStatus,
  findNames,
  gaps,
  ledgerOverrides,
  listFiles,
  matchText,
  nameTerms,
  rankSourceFiles,
  scanTree,
  wordify,
} from "../../tools/parity/lib.mjs";

const temps: string[] = [];
afterEach(() => temps.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tree = (files: Record<string, string>) => {
  const d = mkdtempSync(path.join(tmpdir(), "qt-parity-"));
  temps.push(d);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    writeFileSync(path.join(d, rel), text);
  }
  return d;
};

const CATALOG = {
  categories: { "chart-type": "Chart types", indicator: "Indicators" },
  features: [
    { id: "ct-heikin", cat: "chart-type", name: "Heikin Ashi", patterns: ["heikin.?ashi"] },
    { id: "in-squeeze", cat: "indicator", name: "Squeeze", patterns: ["squeeze"] },
    { id: "in-gpu", cat: "indicator", name: "Not the reference's", patterns: ["webgpu"], ref: false },
    { id: "x-social", cat: "indicator", name: "Social", patterns: ["community"], skip: true },
  ],
};
const compiled = compileCatalog(CATALOG);

describe("matching features in code", () => {
  it("splits camelCase so identifiers match as words, and counts a matching file name as strong evidence", () => {
    expect(wordify("HeikinAshiSeries")).toBe("Heikin Ashi Series");
    expect(matchText(compiled, "src/x.ts", "const s = new HeikinAshiSeries();")["ct-heikin"]).toEqual({ hits: 1, line: 1 });
    expect(matchText(compiled, "src/heikin_ashi.ts", "export {}")["ct-heikin"].hits).toBe(3);
    expect(matchText(compiled, "a.ts", "nothing here")).toEqual({});
  });

  it("scans a tree, skipping dependencies and separating code from docs", () => {
    const d = tree({
      "src/ha.ts": "heikinAshi(bars)",
      "src/chart.ts": "// heikin ashi transform\nsqueeze()",
      "node_modules/x/index.js": "squeeze squeeze",
      "README.md": "- Squeeze momentum",
      "dist/app.js": "heikinAshi",
    });
    expect(listFiles(d)).toEqual(["README.md", "src/chart.ts", "src/ha.ts"]);
    const s = scanTree(d, compiled);
    expect(s.features["ct-heikin"].code.map((x: { file: string }) => x.file)).toEqual(["src/chart.ts", "src/ha.ts"]);
    expect(s.features["in-squeeze"].docs).toHaveLength(1);
    expect(featureStatus(s.features["ct-heikin"])).toBe("yes");
    expect(featureStatus(s.features["in-squeeze"])).toBe("weak");
    expect(featureStatus({ code: [], docs: [{ file: "README.md", hits: 1, line: 1 }] })).toBe("claimed");
    expect(featureStatus(undefined)).toBe("no");
  });
});

describe("matrix, gaps and coverage", () => {
  const repos = [
    { id: "a", listed: "Alpha", repo: "o/alpha", license: "MIT", reuse: "port" },
    { id: "b", listed: "Beta", repo: "o/beta", license: "GPL-3.0", reuse: "features" },
  ];
  const yes = { code: [{ file: "x.ts", hits: 5, line: 1 }], docs: [{ file: "README.md", hits: 1, line: 2 }] };
  const scans = { a: { files: 1, features: { "in-squeeze": yes, "in-gpu": yes } }, b: { files: 1, features: { "in-squeeze": yes } } };
  const ours = { files: 1, features: { "ct-heikin": yes } };

  it("finds the reference features we lack, most common first, leaving out-of-scope ones", () => {
    const m = buildMatrix(CATALOG, repos, scans, ours);
    expect(gaps(m).map((f: { id: string }) => f.id)).toEqual(["in-squeeze"]);
    expect(m.features.find((f: { id: string }) => f.id === "in-squeeze")?.offeredBy).toEqual(["a", "b"]);
    const c = coverage(m, 2, "2026-11-07");
    expect(c).toMatchObject({ projects: 2, inScope: 2, have: 1 });
    expect(JSON.stringify(c)).not.toMatch(/Alpha|Beta|o\/alpha/);
  });

  it("counts adopted features from the ledger as present", () => {
    const m = buildMatrix(CATALOG, repos, scans, ours, ledgerOverrides({ features: { "in-squeeze": { date: "2026-11-07", files: ["core/x.ts"] } } }));
    expect(gaps(m)).toEqual([]);
  });

  it("offers code only from port-licensed projects and docs from the others", () => {
    const src = extractSources("in-squeeze", repos, scans);
    expect(src.map((s: { repo: string }) => s.repo)).toEqual(["a", "b"]);
    expect(src[0].files[0].file).toBe("x.ts");
    expect(src[1].files[0].file).toBe("README.md");
  });
});

describe("work packet sources", () => {
  it("puts implementation files before tests, stories, docs and examples", () => {
    const ranked = rankSourceFiles([
      { file: "test/countdown.test.ts", hits: 40, line: 1 },
      { file: "src/ui/Countdown.stories.tsx", hits: 30, line: 1 },
      { file: "docs/design/kit.py", hits: 20, line: 1 },
      { file: "src/ui/Countdown.tsx", hits: 5, line: 1 },
      { file: "src/chart/axis.ts", hits: 9, line: 1 },
    ]);
    expect(ranked.map((f: { file: string }) => f.file)).toEqual(["src/chart/axis.ts", "src/ui/Countdown.tsx", "test/countdown.test.ts", "src/ui/Countdown.stories.tsx", "docs/design/kit.py"]);
  });
});

describe("keeping names out", () => {
  it("collects project names, owners and repo names plus extra terms, without generic words", () => {
    const terms = nameTerms({ repos: [{ listed: "Candle Lab", repo: "someone/candle-lab" }, { listed: "X", repo: "org/terminal" }], terms: ["Big Product"] });
    expect(terms.sort()).toEqual(["Big Product", "Candle Lab", "candle-lab", "someone"].sort());
  });

  it("finds a name written with spaces, dashes or underscores, but not inside another word", () => {
    const terms = ["Candle Lab", "Big Product"];
    expect(findNames("ok\nsee candle_lab here\nbigproduct", terms)).toEqual([{ line: 2, term: "candle_lab" }, { line: 3, term: "bigproduct" }]);
    expect(findNames("candlelabs", ["Candle Lab"])).toEqual([]);
    expect(findNames("anything", [])).toEqual([]);
  });

  it("keeps the committed catalog, example manifest and ledger free of names", () => {
    const here = path.resolve(__dirname, "../../tools/parity");
    const catalog = JSON.parse(readFileSync(path.join(here, "catalog.json"), "utf8"));
    expect(() => compileCatalog(catalog)).not.toThrow();
    expect(new Set(catalog.features.map((f: { id: string }) => f.id)).size).toBe(catalog.features.length);
    for (const f of catalog.features) expect(Object.keys(catalog.categories)).toContain(f.cat);
    const example = JSON.parse(readFileSync(path.join(here, "repos.example.json"), "utf8"));
    expect(example.repos[0].repo).toBe("owner/name");
  });
});
