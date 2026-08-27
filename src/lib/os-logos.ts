import type { ImageSource } from 'expo-image'
import type { ServerOsLogoKey } from '@/lib/instance-api'

/**
 * Density-aware PNGs from `pnpm os-logos` (`assets/os/<slug>.png` + @2x/@3x).
 * Metro selects the right scale for retina / HiDPI / iPhone.
 *
 * Only keys with licensed artwork in `assets/os/` resolve to an image. The
 * control plane may still send `raspberry-pi-os`; that key is valid on the
 * wire and maps to `null` here so the UI can fall back to a text mark.
 * Provenance: `assets/os/NOTICE.md`.
 */
const DEBIAN_LOGO = require('@/assets/os/debian.png') as ImageSource

export function osLogoSource(
  logo: ServerOsLogoKey | null | undefined,
): ImageSource | null {
  if (logo === 'debian') return DEBIAN_LOGO
  return null
}
