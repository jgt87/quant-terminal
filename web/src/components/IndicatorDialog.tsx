// Indicator picker: searchable list of the core indicator registry, plus indicator templates
// (save the chart's indicators under a name, apply a saved set to any chart).

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { INDICATORS, type IndicatorInstance } from "@qt/core";
import { STUDY_DEFS } from "../chart/studies/defs";
import { indicatorTemplates, loadIndicatorTemplates, onIndicatorTemplates, removeIndicatorTemplate, saveCurrentAsTemplate } from "../state/indicatorTemplateStore";
import { Dialog } from "./Dialog";
import { Icon } from "./icons";

/** Core indicators plus the built-in chart studies (profiles, patterns, zig zag, auto fib). */
const ALL = [...INDICATORS, ...STUDY_DEFS];

interface Props {
  onAdd(indicatorId: string): void;
  onClose(): void;
  /** The chart's indicators (what "Save" stores). */
  current?: readonly IndicatorInstance[];
  /** Replaces the chart's indicators with a template's. */
  onApplyTemplate?(name: string): void;
}

export function IndicatorDialog({ onAdd, onClose, current, onApplyTemplate }: Props) {
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
      {onApplyTemplate && <TemplateBar current={current ?? []} onApply={onApplyTemplate} />}
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

function TemplateBar({ current, onApply }: { current: readonly IndicatorInstance[]; onApply(name: string): void }) {
  const [, setVersion] = useState(0);
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => {
    void loadIndicatorTemplates();
    return onIndicatorTemplates(() => setVersion((v) => v + 1));
  }, []);
  const saved = indicatorTemplates().saved;
  const save = () => {
    const name = naming?.trim();
    if (!name) return;
    void saveCurrentAsTemplate(name, current);
    setNaming(null);
  };
  return (
    <div className="ind-templates" aria-label="Indicator templates">
      <span className="ind-templates-label">Templates</span>
      {saved.map((t) => (
        <span key={t.name} className="ind-template">
          <button className="ind-template-apply" title={`Replace this chart's indicators with "${t.name}" (${t.indicators.length})`} onClick={() => onApply(t.name)}>
            {t.name}
          </button>
          <button className="ind-template-remove" aria-label={`Delete template ${t.name}`} title="Delete template" onClick={() => void removeIndicatorTemplate(t.name)}>
            ×
          </button>
        </span>
      ))}
      {saved.length === 0 && naming === null && <span className="ind-templates-empty">none saved yet</span>}
      {naming === null ? (
        <button className="btn ghost small" disabled={current.length === 0} title="Save this chart's indicators as a template" onClick={() => setNaming("")}>
          Save current…
        </button>
      ) : (
        <input
          className="text-input small"
          autoFocus
          aria-label="Template name"
          placeholder="Template name, Enter saves"
          maxLength={80}
          value={naming}
          onChange={(e) => setNaming(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setNaming(null);
            }
          }}
        />
      )}
    </div>
  );
}
