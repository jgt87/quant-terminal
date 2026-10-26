// Indicator picker: searchable list of the core indicator registry.

import { useMemo, useState, type KeyboardEvent } from "react";
import { INDICATORS } from "@qt/core";
import { STUDY_DEFS } from "../chart/studies/defs";

/** Core indicators plus the built-in chart studies (profiles, patterns, zig zag, auto fib). */
const ALL = [...INDICATORS, ...STUDY_DEFS];
import { Dialog } from "./Dialog";
import { Icon } from "./icons";

interface Props {
  onAdd(indicatorId: string): void;
  onClose(): void;
}

export function IndicatorDialog({ onAdd, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ALL.filter((d) => !t || d.name.toLowerCase().includes(t) || d.shortName.toLowerCase().includes(t));
  }, [q]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      onAdd(list[active].id);
    }
  };

  return (
    <Dialog title="Indicators" onClose={onClose} width={440}>
      <div className="search-box">
        <Icon name="search" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          aria-label="Search indicators"
          placeholder="Search indicators"
          spellCheck={false}
        />
      </div>
      <ul className="search-results" role="listbox" aria-label="Indicators">
        {list.map((d, i) => (
          <li
            key={d.id}
            role="option"
            aria-selected={i === active}
            aria-label={d.name}
            data-indicator-id={d.id}
            className={i === active ? "active" : ""}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAdd(d.id)}
          >
            <span className="sr-symbol">{d.shortName}</span>
            <span className="sr-name">{d.name}</span>
            <span className="sr-type">{"study" in d ? "built-in" : d.pane === "overlay" ? "overlay" : "pane"}</span>
          </li>
        ))}
        {list.length === 0 && <li className="search-empty">No indicators match</li>}
      </ul>
    </Dialog>
  );
}
