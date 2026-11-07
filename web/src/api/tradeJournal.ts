// Trade journal notes REST API: the note and tags per paper trade (the trades come from the fills).

import type { TradeJournalDoc, TradeNote } from "@qt/core";
import { jsonBody, requestJson } from "./http";

export const getTradeJournal = () => requestJson<TradeJournalDoc>("/api/trade-journal");

/** Save a trade's note and tags; an empty note with no tags removes it. */
export const putTradeNote = (key: string, note: Pick<TradeNote, "note" | "tags">) =>
  requestJson<TradeJournalDoc>(`/api/trade-journal/${encodeURIComponent(key)}`, jsonBody("PUT", note));

/** Journal key of a trade: account and the id of the fill that opened it. */
export const tradeKey = (accountId: string, tradeId: string) => `${accountId}:${tradeId}`;
