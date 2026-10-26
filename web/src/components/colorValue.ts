// Hex color helpers for the color picker: split "#rrggbbaa" into color + opacity and back.

export function parseHex(v: string | undefined): { hex: string; alpha: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec((v ?? "").trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { hex: `#${h.slice(0, 6)}`, alpha: Math.round(alpha * 100) / 100 };
}

export function toHex(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (a >= 0.999) return hex.toLowerCase();
  return `${hex.toLowerCase()}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}
