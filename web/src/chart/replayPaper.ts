// Client-side paper account for Bar Replay: market orders fill at the current replay bar's
// close plus slippage (against the trader), commission in basis points of notional. One net
// position per session; separate from the server paper account. Pure.

export interface ReplayFill {
  id: number;
  time: number;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  /** Realized P&L of this fill (closing part), excluding fees. */
  realized: number;
}

export interface ReplayAccount {
  /** Net position: positive long, negative short. */
  qty: number;
  avgPrice: number;
  realized: number;
  fees: number;
  fills: ReplayFill[];
}

export const EMPTY_ACCOUNT: ReplayAccount = { qty: 0, avgPrice: 0, realized: 0, fees: 0, fills: [] };

export interface Costs {
  commissionBps: number;
  slippageBps: number;
}

export type ReplayOrder = { side: "buy" | "sell"; qty: number } | { side: "flat" };

/** Fill price for a side: close moved against the trader by the slippage. */
export function fillPrice(close: number, side: "buy" | "sell", slippageBps: number): number {
  const s = slippageBps / 10000;
  return side === "buy" ? close * (1 + s) : close * (1 - s);
}

export function placeOrder(acc: ReplayAccount, order: ReplayOrder, close: number, time: number, costs: Costs): ReplayAccount {
  let side: "buy" | "sell";
  let qty: number;
  if (order.side === "flat") {
    if (acc.qty === 0) return acc;
    side = acc.qty > 0 ? "sell" : "buy";
    qty = Math.abs(acc.qty);
  } else {
    side = order.side;
    qty = order.qty;
  }
  if (!(qty > 0) || !(close > 0)) return acc;
  const price = fillPrice(close, side, costs.slippageBps);
  const fee = (price * qty * costs.commissionBps) / 10000;
  const signed = side === "buy" ? qty : -qty;
  let realized = 0;
  let newQty = acc.qty + signed;
  let avg = acc.avgPrice;
  if (acc.qty !== 0 && Math.sign(signed) !== Math.sign(acc.qty)) {
    const closing = Math.min(Math.abs(signed), Math.abs(acc.qty));
    realized = closing * (price - acc.avgPrice) * Math.sign(acc.qty);
    if (Math.abs(signed) > Math.abs(acc.qty)) avg = price; // reversed: remainder opens at this price
    else if (newQty === 0) avg = 0;
  } else {
    avg = (Math.abs(acc.qty) * acc.avgPrice + qty * price) / Math.abs(newQty);
  }
  newQty = Math.round(newQty * 1e8) / 1e8;
  const fill: ReplayFill = { id: acc.fills.length + 1, time, side, qty, price, fee, realized };
  return { qty: newQty, avgPrice: newQty === 0 ? 0 : avg, realized: acc.realized + realized, fees: acc.fees + fee, fills: [...acc.fills, fill] };
}

/** Open P&L at `price`. */
export function unrealized(acc: ReplayAccount, price: number): number {
  return acc.qty === 0 ? 0 : acc.qty * (price - acc.avgPrice);
}

/** Total P&L (realized + open − fees). */
export function totalPnl(acc: ReplayAccount, price: number): number {
  return acc.realized + unrealized(acc, price) - acc.fees;
}
