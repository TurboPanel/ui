import type { ColorScheme, Palette } from '@/lib/theme-palettes'

/**
 * Fill and text colours of the "HIGH AVAILABILITY" pill beside the T mark.
 *
 * Dark keeps the blue-tinted fill with title text. Light is white text, and
 * white cannot be read on Paper's pale blue tint, so the fill there is the
 * solid HA brand blue (white on it is above 4.5:1; the palette test checks it).
 */
export function haWordmarkColors(
  scheme: ColorScheme,
  palette: Palette,
): { fill: string; text: string } {
  if (scheme === 'light') {
    return { fill: palette.brand, text: palette.buttonTextOnBlue }
  }
  return { fill: palette.bgActiveBlue, text: palette.textTitle }
}
