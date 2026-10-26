// Pure placement math for context menus: keep the menu fully inside the viewport.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Top-left of a w×h menu opened at the pointer (x, y) in a vw×vh viewport. It opens down-right,
 * flips left / up when it would overflow, and is finally clamped inside the margins.
 */
export function placeMenu(x: number, y: number, w: number, h: number, vw: number, vh: number, margin = 4): { left: number; top: number } {
  let left = x + w > vw - margin ? x - w : x;
  let top = y + h > vh - margin ? y - h : y;
  left = clamp(left, margin, Math.max(margin, vw - margin - w));
  top = clamp(top, margin, Math.max(margin, vh - margin - h));
  return { left, top };
}

/** Submenu next to its parent item: to the right, else to the left; aligned with the item top. */
export function placeSubmenu(item: Rect, w: number, h: number, vw: number, vh: number, margin = 4): { left: number; top: number } {
  let left = item.right + w > vw - margin ? item.left - w : item.right;
  left = clamp(left, margin, Math.max(margin, vw - margin - w));
  const top = clamp(item.top - 4, margin, Math.max(margin, vh - margin - h));
  return { left, top };
}
