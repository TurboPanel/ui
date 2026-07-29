function expandRgb(hex: string): string | null {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex
  if (raw.length === 3) {
    return `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  if (raw.length === 6) return raw
  return null
}

/** Append 2-digit hex alpha to a `#RGB` / `#RRGGBB` token (theme hex only). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = expandRgb(hex)
  if (!rgb) return hex
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${rgb}${a}`
}

/**
 * Mix a color toward black as an opaque `#RRGGBB`.
 * Prefer this for gradients — Safari bands badly when interpolating alpha.
 */
export function mixHexWithBlack(hex: string, amount: number): string {
  const rgb = expandRgb(hex)
  if (!rgb) return hex
  const t = Math.min(1, Math.max(0, amount))
  const r = Math.round(Number.parseInt(rgb.slice(0, 2), 16) * t)
  const g = Math.round(Number.parseInt(rgb.slice(2, 4), 16) * t)
  const b = Math.round(Number.parseInt(rgb.slice(4, 6), 16) * t)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}
