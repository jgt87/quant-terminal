// Indicator templates document (`indicator-templates.json`): named sets of indicators the user
// saved from a chart. GET returns { saved: [] } when nothing is stored yet.

import { MAX_INDICATOR_TEMPLATES, MAX_TEMPLATE_INDICATORS, type IndicatorTemplates } from "@qt/core";
import { badRequest } from "./errors";
import type { Router } from "./http";
import { readJsonBody } from "./http";
import type { Store } from "./store";

const DOC = "indicator-templates.json";
/** Serialized size limit of the whole document. */
const MAX_JSON = 1_000_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates the whole templates document (PUT body). */
export function validateIndicatorTemplates(body: unknown): IndicatorTemplates {
  if (!isObj(body) || !Array.isArray(body.saved)) throw badRequest("Indicator templates must be an object with a saved array");
  if (JSON.stringify(body).length > MAX_JSON) throw badRequest("Indicator templates are too large");
  if (body.saved.length > MAX_INDICATOR_TEMPLATES) throw badRequest(`Too many indicator templates (max ${MAX_INDICATOR_TEMPLATES})`);
  const names = new Set<string>();
  const saved = body.saved.map((t, i) => {
    const where = `saved[${i}]`;
    if (!isObj(t)) throw badRequest(`${where} must be an object`);
    if (typeof t.name !== "string" || !t.name.trim() || t.name.length > 80) throw badRequest(`${where}.name must be a string (1-80)`);
    if (names.has(t.name)) throw badRequest(`Duplicate indicator template name: ${t.name}`);
    names.add(t.name);
    if (!Array.isArray(t.indicators) || t.indicators.length > MAX_TEMPLATE_INDICATORS) {
      throw badRequest(`${where}.indicators must be an array (max ${MAX_TEMPLATE_INDICATORS})`);
    }
    for (const ind of t.indicators) {
      if (!isObj(ind) || typeof ind.uid !== "string" || typeof ind.indicatorId !== "string" || !isObj(ind.inputs)) {
        throw badRequest(`${where}.indicators contains an invalid entry`);
      }
    }
    return { name: t.name, indicators: t.indicators as IndicatorTemplates["saved"][number]["indicators"] };
  });
  return { saved };
}

export function registerIndicatorTemplateRoutes(router: Router, store: Store): void {
  router.get("/api/indicator-templates", async () => (await store.readDoc<IndicatorTemplates>(DOC)) ?? { saved: [] });

  router.put("/api/indicator-templates", async ({ req }) => {
    const doc = validateIndicatorTemplates(await readJsonBody(req));
    await store.updateDoc<IndicatorTemplates, IndicatorTemplates>(DOC, () => ({ value: doc, result: doc }));
    return doc;
  });
}
