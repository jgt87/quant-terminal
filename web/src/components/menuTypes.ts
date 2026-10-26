// Context menu model shared by the menu component and the menu builders.

export interface MenuAction {
  type?: "item";
  /** Stable id so builders can omit / insert around items (optional). */
  id?: string;
  label: string;
  /** Optional icon name (components/icons.tsx) shown in the icon column. */
  icon?: string;
  /** Right-aligned hint such as "Del" or "Alt+H". */
  shortcut?: string;
  disabled?: boolean;
  /** Checkable item: true/false shows the check state; undefined is a plain item. */
  checked?: boolean;
  onSelect?(): void;
  submenu?: MenuItem[];
}

export interface MenuSeparator {
  type: "separator";
}

/** Non-interactive section header inside a menu. */
export interface MenuHeader {
  type: "header";
  label: string;
}

export type MenuItem = MenuAction | MenuSeparator | MenuHeader;

export const SEP: MenuSeparator = { type: "separator" };

export const isAction = (m: MenuItem): m is MenuAction => m.type === undefined || m.type === "item";

export const isHeader = (m: MenuItem): m is MenuHeader => m.type === "header";

export const header = (label: string): MenuHeader => ({ type: "header", label });
