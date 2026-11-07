// "What's new" after an update: the CHANGELOG.md entries of the versions between the one updated
// from and the installed one, shortened to their first sentence and wrapped to the window, in a box.
import { compareVersions } from "./update.mjs";

/** CHANGELOG.md → [{ version: "0.5.1", date: "2026-11-07", items: [...] }], newest first ("Unreleased" left out). */
export function parseChangelog(text) {
  const out = [];
  let cur = null;
  let item = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const head = /^##\s+v(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/.exec(raw.trim());
    if (head) {
      cur = { version: head[1], date: (head[2] ?? "").trim(), items: [] };
      out.push(cur);
      item = null;
      continue;
    }
    if (/^##\s/.test(raw)) {
      cur = null; // "Unreleased" or another heading
      continue;
    }
    if (!cur) continue;
    const bullet = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (bullet) {
      item = bullet[1].trim();
      cur.items.push(item);
    } else if (item !== null && raw.trim()) {
      // A bullet continued on the next line.
      cur.items[cur.items.length - 1] = `${cur.items[cur.items.length - 1]} ${raw.trim()}`;
    } else {
      item = null;
    }
  }
  return out;
}

/** Sections newer than `from` up to and including `to`, newest first. */
export function sectionsBetween(sections, from, to) {
  return sections.filter((s) => compareVersions(s.version, from) > 0 && compareVersions(s.version, to) <= 0);
}

/**
 * One line about an entry: markdown removed, parenthetical details left out, cut at the end of the
 * first sentence (a "." or ";" outside parentheses) and at most `max` characters.
 */
export function summarize(entry, max = 130) {
  let t = entry
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Drop "( ... )" groups, innermost first, so nested ones go too.
  for (let prev = ""; prev !== t; ) {
    prev = t;
    // Only a group that ends a phrase: "Start Terminal (Deriv FX).cmd" keeps its name.
    t = t.replace(/\s*\([^()]*\)(?=[\s,:;]|\.(?:\s|$)|$)/g, "");
  }
  t = t.replace(/\s+/g, " ").replace(/\s+([,:;.])(?=\s|$)/g, "$1").trim();
  const stop = /[.;](\s|$)/.exec(t);
  if (stop && stop.index > 20) t = t.slice(0, stop.index) + ".";
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…`;
  return t;
}

/** Wrap text to `width` columns. */
export function wrap(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The "What's new" box. `width` is the window width; `color` adds ANSI colors (the Windows console
 * and Windows Terminal show them). At most `maxVersions` versions and `maxItems` entries each.
 */
export function renderWhatsNew(sections, { from, to, width = 100, color = false, maxVersions = 4, maxItems = 6 } = {}) {
  if (!sections.length) return "";
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const w = Math.max(50, Math.min(width, 110) - 2);
  const inner = w - 4; // "│  " + text
  const rule = (label) => {
    const text = label ? `─ ${label} ` : "";
    return text + "─".repeat(Math.max(0, w - 1 - text.length));
  };
  const lines = [];
  lines.push(c("36", `┌${rule(`What's new: v${from} → v${to}`)}`));
  const shown = sections.slice(0, maxVersions);
  shown.forEach((s, i) => {
    if (i) lines.push(c("36", "│"));
    lines.push(`${c("36", "│")} ${c("1;33", `v${s.version}`)}${s.date ? c("90", `  ${s.date}`) : ""}`);
    for (const item of s.items.slice(0, maxItems)) {
      wrap(summarize(item), inner - 2).forEach((l, j) => lines.push(`${c("36", "│")}   ${j ? "  " : c("32", "• ")}${l}`));
    }
    if (s.items.length > maxItems) lines.push(`${c("36", "│")}   ${c("90", `… and ${s.items.length - maxItems} more`)}`);
  });
  if (sections.length > shown.length) {
    lines.push(c("36", "│"));
    lines.push(`${c("36", "│")} ${c("90", `… and ${sections.length - shown.length} earlier release(s)`)}`);
  }
  lines.push(c("36", `└${rule("Full list: CHANGELOG.md")}`));
  return lines.join("\n");
}
