// Portfolio transactions as CSV (RFC 4180, via the core writer): one header row
// `id,time,symbol,side,qty,price,fee,note`, times in ISO 8601 UTC.

import { csvRow, type PortfolioTransaction } from "@qt/core";
import type { NewTransaction } from "../../api/portfolio";
import { parseCsvObjects } from "../common/csv";

export const TX_COLUMNS = ["id", "time", "symbol", "side", "qty", "price", "fee", "note"] as const;

export function transactionsToCsv(txs: readonly PortfolioTransaction[]): string {
  const rows = [csvRow([...TX_COLUMNS])];
  for (const t of txs) rows.push(csvRow([t.id, new Date(t.time).toISOString(), t.symbol, t.side, t.qty, t.price, t.fee, t.note ?? ""]));
  return rows.join("\r\n") + "\r\n";
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Parse a transactions CSV. Accepts `date` for `time` and `commission` for `fee`; rows with errors are reported. */
export function parseTransactionsCsv(text: string): { txs: NewTransaction[]; errors: string[] } {
  const txs: NewTransaction[] = [];
  const errors: string[] = [];
  parseCsvObjects(text).forEach((r, i) => {
    const line = i + 2;
    const timeText = r.time ?? r.date ?? "";
    const time = /^\d+$/.test(timeText) ? Number(timeText) : Date.parse(timeText);
    const side = (r.side ?? "").toLowerCase();
    const qty = Number(r.qty ?? r.quantity);
    const price = Number(r.price);
    const fee = r.fee !== undefined && r.fee !== "" ? Number(r.fee) : r.commission ? Number(r.commission) : 0;
    const symbol = (r.symbol ?? "").trim();
    const problems: string[] = [];
    if (!symbol) problems.push("symbol missing");
    if (side !== "buy" && side !== "sell") problems.push("side must be buy or sell");
    if (!Number.isFinite(time) || time <= 0) problems.push("time is not a date");
    if (!(qty > 0)) problems.push("qty must be positive");
    if (!(price >= 0) || r.price === undefined || r.price === "") problems.push("price missing");
    if (!(fee >= 0)) problems.push("fee must be 0 or more");
    if (problems.length) {
      errors.push(`Line ${line}: ${problems.join(", ")}`);
      return;
    }
    const tx: NewTransaction = { time, symbol, side: side as "buy" | "sell", qty, price, fee };
    if (r.id && ID_RE.test(r.id)) tx.id = r.id;
    if (r.note) tx.note = r.note;
    txs.push(tx);
  });
  return { txs, errors };
}
