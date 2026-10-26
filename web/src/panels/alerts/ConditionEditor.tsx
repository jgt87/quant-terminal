// One AND-ed condition row: left operand, operator, right operand (or % / bars for moving-%).

import type { AlertOperator, Drawing } from "@qt/core";
import { Icon } from "../../components/icons";
import { isChannelOp, isMovingPct, operatorsFor, type ConditionDraft } from "./alertModel";
import { OperandEditor } from "./OperandEditor";

interface Props {
  index: number;
  value: ConditionDraft;
  drawings: Drawing[];
  canRemove: boolean;
  onChange(next: ConditionDraft): void;
  onRemove(): void;
}

export function ConditionEditor({ index, value, drawings, canRemove, onChange, onRemove }: Props) {
  const moving = isMovingPct(value.op);
  return (
    <div className="al-cond" data-cond={index}>
      <span className="al-cond-tag">{index === 0 ? "IF" : "AND"}</span>
      <div className="al-cond-body">
        <OperandEditor label={`Condition ${index + 1} left`} value={value.left} kinds={["price", "indicator"]} drawings={drawings} onChange={(left) => onChange({ ...value, left })} />
        <select
          className="al-op"
          value={value.op}
          aria-label={`Condition ${index + 1} operator`}
          onChange={(e) => {
            const op = e.target.value as AlertOperator;
            const next = { ...value, op };
            if (isChannelOp(op) && next.right.kind !== "drawing") next.right = { ...next.right, kind: "drawing" };
            onChange(next);
          }}
        >
          {operatorsFor(value, drawings).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {moving ? (
          <div className="al-operand">
            <input type="text" inputMode="decimal" className="al-num small" placeholder="%" aria-label={`Condition ${index + 1} percent`} value={value.pct} onChange={(e) => onChange({ ...value, pct: e.target.value })} />
            <span className="muted">% in</span>
            <input type="number" className="al-num small" min={1} max={1000} aria-label={`Condition ${index + 1} bars`} value={value.bars} onChange={(e) => onChange({ ...value, bars: e.target.value })} />
            <span className="muted">bars</span>
          </div>
        ) : (
          <OperandEditor
            label={`Condition ${index + 1} right`}
            value={value.right}
            kinds={isChannelOp(value.op) ? ["drawing"] : ["value", "price", "indicator", "drawing"]}
            drawings={drawings}
            onChange={(right) => onChange({ ...value, right })}
          />
        )}
      </div>
      <button className="icon-btn" title="Remove condition" onClick={onRemove} disabled={!canRemove}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
