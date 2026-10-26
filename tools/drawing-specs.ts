// Prints the registered drawing tools (type, family, label, anchors, factory style / props /
// text) and the left-toolbar flyout groups as JSON, for tools/drawing-sheets.mjs.
// Usage: npx tsx tools/drawing-specs.ts > specs.json
import { allTools, toolbarGroups } from "../web/src/chart/drawings/registry";

const tools = allTools().map((t) => ({
  type: t.type,
  family: t.family,
  label: t.label,
  anchors: t.anchors,
  defaults: t.defaults,
  defaultProps: t.defaultProps ?? {},
  defaultText: t.defaultText,
  toolbar: t.toolbar !== false,
}));
const groups = toolbarGroups().map((g) => ({ id: g.id, label: g.label, sections: g.sections.map((s) => ({ title: s.title, tools: s.tools.map((t) => t.type) })) }));
process.stdout.write(JSON.stringify({ tools, groups }));
