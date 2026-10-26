// Keyboard shortcut help ("?"): the workspace bindings as the app actually handles them, and
// the browser's own keys the app leaves alone.

import { hotkeyMap, toolLabel } from "../../chart/drawings/registry";
import drawingKeys from "../../config/drawingKeys.json";
import { SHORTCUTS } from "../../state/shortcuts";
import { Dialog } from "../Dialog";

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={520}>
      <table className="shortcut-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Keys</th>
            <th>Browser key (not used)</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.id} data-shortcut={s.id}>
              <td>
                {s.label}
                {s.note && <span className="shortcut-note">{s.note}</span>}
              </td>
              <td>
                <kbd>{s.keys}</kbd>
              </td>
              <td className="muted">{s.browser ?? ""}</td>
            </tr>
          ))}
          {drawingKeys.map((k) => (
            <tr key={k.keys}>
              <td>{k.label} (on the chart)</td>
              <td>
                <kbd>{k.keys}</kbd>
              </td>
              <td />
            </tr>
          ))}
          {Object.entries(hotkeyMap()).map(([key, hk]) => (
            <tr key={key}>
              <td>
                {hk.action === "draw-at-cursor" ? `Draw ${toolLabel(hk.type).toLowerCase()} at the cursor` : `${toolLabel(hk.type)} tool`} (on the chart)
              </td>
              <td>
                <kbd>{key.split("+").map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join("+")}</kbd>
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="shortcut-foot">
        The browser keeps Ctrl+T, Ctrl+W, Ctrl+Tab and Ctrl+1..9 for its own tabs, so the app uses the Alt keys above. Shortcuts are ignored
        while a text field has focus.
      </p>
    </Dialog>
  );
}
