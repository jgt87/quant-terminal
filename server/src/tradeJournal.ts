// Trade journal notes (`trade-journal.json`): the user's note and tags per paper trade, keyed by
// "<account id>:<id of the fill that opened the trade>". The trades themselves are derived from
// the paper account's fills on the client; only what the user typed is stored here.

import { MAX_NOTE_LENGTH, MAX_TAG_LENGTH, MAX_TAGS, type TradeJournalDoc, type TradeNote } from "@qt/core";
import { badRequest } from "./errors";
import type { Router } from "./http";
import { readJsonBody } from "./http";
import type { Store } from "./store";

const DOC = "trade-journal.json";
/** Notes kept at most; the oldest are dropped beyond this. */
export const MAX_JOURNAL_NOTES = 5000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates a note (PUT body). An empty note without tags means "remove". */
export function validateTradeNote(body: unknown, now: number): TradeNote | null {
  if (!isObj(body)) throw badRequest("Body must be an object");
  const note = body.note ?? "";
  if (typeof note !== "string" || note.length > MAX_NOTE_LENGTH) throw badRequest(`note must be a string (max ${MAX_NOTE_LENGTH})`);
  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || tags.length > MAX_TAGS) throw badRequest(`tags must be an array (max ${MAX_TAGS})`);
  for (const t of tags) if (typeof t !== "string" || !t.trim() || t.length > MAX_TAG_LENGTH) throw badRequest(`each tag must be a string (1-${MAX_TAG_LENGTH})`);
  const clean = [...new Set((tags as string[]).map((t) => t.trim()))];
  if (!note.trim() && clean.length === 0) return null;
  return { note, tags: clean, updatedAt: now };
}

const validKey = (k: string) => /^[A-Za-z0-9._:-]{1,200}$/.test(k);

export function registerTradeJournalRoutes(router: Router, store: Store): void {
  router.get("/api/trade-journal", async () => (await store.readDoc<TradeJournalDoc>(DOC)) ?? { notes: {} });

  router.put("/api/trade-journal/:key", async ({ req, params }) => {
    if (!validKey(params.key)) throw badRequest("Invalid trade key");
    const note = validateTradeNote(await readJsonBody(req), Date.now());
    return store.updateDoc<TradeJournalDoc, TradeJournalDoc>(DOC, (cur) => {
      const notes = { ...(cur?.notes ?? {}) };
      if (note) notes[params.key] = note;
      else delete notes[params.key];
      const keys = Object.keys(notes);
      if (keys.length > MAX_JOURNAL_NOTES) {
        keys.sort((a, b) => notes[a].updatedAt - notes[b].updatedAt);
        for (const k of keys.slice(0, keys.length - MAX_JOURNAL_NOTES)) delete notes[k];
      }
      const doc = { notes };
      return { value: doc, result: doc };
    });
  });
}
