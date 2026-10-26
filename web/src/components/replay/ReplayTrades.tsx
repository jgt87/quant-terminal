// Trade list of the replay paper session.

import { formatTimeFull } from "../../chart/format";
import type { ReplayFill } from "../../chart/replayPaper";

export function ReplayTrades({ fills, format }: { fills: ReplayFill[]; format(v: number): string }) {
  return (
    <div className="replay-trades" aria-label="Replay trades">
      {fills.length === 0 ? (
        <p className="muted">No trades in this replay session yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Fee</th>
              <th>Realized</th>
            </tr>
          </thead>
          <tbody>
            {[...fills].reverse().map((f) => (
              <tr key={f.id}>
                <td>{f.id}</td>
                <td>{formatTimeFull(f.time, true)}</td>
                <td className={f.side === "buy" ? "pos" : "neg"}>{f.side}</td>
                <td>{f.qty}</td>
                <td>{format(f.price)}</td>
                <td>{format(f.fee)}</td>
                <td className={f.realized >= 0 ? "pos" : "neg"}>{f.realized ? format(f.realized) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
