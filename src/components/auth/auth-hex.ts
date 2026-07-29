/** Append 2-digit hex alpha to a `#RGB` / `#RRGGBB` token (theme hex only). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex
  let rgb = raw
  if (raw.length === 3) {
    rgb = `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  if (rgb.length !== 6) return hex
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${rgb}${a}`
}
