# Feature parity: the repeatable loop

Quant Terminal is measured against the feature set of the reference charting platform
(`tools/parity/catalog.json`, public feature names only) and against a set of open-source
projects with similar goals. One round of the loop indexes them, picks gaps, builds them here and
records the result, so the next round starts where this one ended.

No project or product names enter the repository: the project list lives in the git-ignored
`data/parity/repos.json` (format: `tools/parity/repos.example.json`), and everything that names a
project (clones, evidence, the full report, work packets) stays in `data/parity/`.

## One round

```
npm run parity -- index --update        # 1. fetch/update the projects and scan them and us
npm run parity -- status                # 2. coverage now vs the committed docs/parity/coverage.json
npm run parity -- gaps                  # 3. our gaps, the most common in the projects first
npm run parity -- extract <feature-id>  # 4. work packet: data/parity/work/<id>/PACKET.md + sources
                                        # 5. build it (below)
npm run parity -- adopt <feature-id> --files core/src/…,web/src/… [--ported <project-id>]
npm run parity -- index --no-fetch      # 6. confirm the gap closed
npm run parity -- check-names           # 7. must pass before committing
```

Commit `tools/parity/adopted.json`, `docs/parity/coverage.json`, the feature and its tests, and
a CHANGELOG line. A new project to compare goes into `data/parity/repos.json` with its license;
a new reference feature goes into the catalog with patterns that match how projects name it.

## Building a feature (step 5)

1. Read the work packet. Its sources are ranked: projects whose license allows adapting code first,
   then feature-only projects, which list their docs only. Never open the code of a feature-only project.
2. Prefer the public definition of the feature (formula, documented behavior) and write it the way
   this codebase works: pure logic in `core/` with tests, rendering in `web/src/chart/`, colors from
   theme tokens, settings in the existing dialogs.
3. When code from a port-licensed project is adapted, pass `--ported <project-id>`: the ledger then
   records a name-free source key and its license text is stored in `third_party/licenses/`.
4. No project or product names anywhere: identifiers, comments, UI text, docs, commit messages.

## When the scan is wrong

Matching is by patterns, so a feature can be missed (we name it differently) or found where it is
only mentioned. Missed in our code: improve the catalog patterns, or record it with `adopt` and the
files that implement it. Missed or over-counted in a project: improve the patterns; the report is a
lead, and the code decides.

## Files

| File | Committed | What |
|---|---|---|
| `tools/parity/catalog.json` | yes | reference features, categories and match patterns |
| `tools/parity/adopted.json` | yes | ledger: features built through the loop, our files, ported source key |
| `docs/parity/coverage.json` | yes | our status per feature after the last index (name-free) |
| `third_party/licenses/*.txt` | yes | license texts of adapted code (required by those licenses) |
| `data/parity/repos.json` | no | the compared projects, their licenses, and names to keep out |
| `data/parity/INVENTORY.md` | no | full report with the per-project matrix |
| `data/parity/work/<id>/` | no | work packets |
