// Drawing templates document (`drawing-templates.json`): per tool type an optional default
// template plus named saved templates. GET returns {} when nothing is stored yet.

import type { DrawingTemplates } from "@qt/core";
import { badRequest } from "../errors";
import type { Router } from "../http";
import { readJsonBody } from "../http";
import type { Store } from "../store";

const DOC = "drawing-templates.json";
const TYPE_RE = /^[a-z][a-z0-9-]{0,47}$/i;
const MAX_TYPES = 300;
const MAX_SAVED = 100;
/** Serialized size limit of one style/props object. */
const MAX_JSON = 20000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function smallObject(v: unknown, where: string): Record<string, unknown> {
  if (!isObj(v)) throw badRequest(`${where} must be an object`);
  if (JSON.stringify(v).length > MAX_JSON) throw badRequest(`${where} is too large`);
  return v;
}

/** Validates the whole templates document (PUT body). */
export function validateDrawingTemplates(body: unknown): DrawingTemplates {
  if (!isObj(body)) throw badRequest("Drawing templates must be an object keyed by tool type");
  const entries = Object.entries(body);
  if (entries.length > MAX_TYPES) throw badRequest(`Too many tool types (max ${MAX_TYPES})`);
  const out: DrawingTemplates = {};
  for (const [type, t] of entries) {
    if (!TYPE_RE.test(type)) throw badRequest(`Invalid tool type: ${type}`);
    if (!isObj(t)) throw badRequest(`templates.${type} must be an object`);
    const saved = t.saved ?? [];
    if (!Array.isArray(saved) || saved.length > MAX_SAVED) throw badRequest(`templates.${type}.saved must be an array (max ${MAX_SAVED})`);
    const names = new Set<string>();
    const entry: DrawingTemplates[string] = {
      saved: saved.map((s, i) => {
        const where = `templates.${type}.saved[${i}]`;
        if (!isObj(s)) throw badRequest(`${where} must be an object`);
        if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 80) throw badRequest(`${where}.name must be a string (1-80)`);
        if (names.has(s.name)) throw badRequest(`Duplicate template name in ${type}: ${s.name}`);
        names.add(s.name);
        const style = smallObject(s.style ?? {}, `${where}.style`);
        return s.props === undefined ? { name: s.name, style } : { name: s.name, style, props: smallObject(s.props, `${where}.props`) };
      }),
    };
    if (t.default !== undefined && t.default !== null) {
      const d = smallObject(t.default, `templates.${type}.default`);
      const style = smallObject(d.style ?? {}, `templates.${type}.default.style`);
      entry.default = d.props === undefined ? { style } : { style, props: smallObject(d.props, `templates.${type}.default.props`) };
    }
    out[type] = entry;
  }
  return out;
}

export function registerDrawingTemplateRoutes(router: Router, store: Store): void {
  router.get("/api/drawing-templates", async () => (await store.readDoc<DrawingTemplates>(DOC)) ?? {});

  router.put("/api/drawing-templates", async ({ req }) => {
    const doc = validateDrawingTemplates(await readJsonBody(req));
    await store.updateDoc<DrawingTemplates, DrawingTemplates>(DOC, () => ({ value: doc, result: doc }));
    return doc;
  });
}
