import type { ImageSource } from 'expo-image'
import type { ServerOsLogoKey } from '@/lib/instance-api'

/**
 * Density-aware PNGs from `pnpm os-logos` (`assets/os/<slug>.png` + @2x/@3x).
 * Metro selects the right scale for retina / HiDPI / iPhone.
 */
const DEBIAN_LOGO = require('@/assets/os/debian.png') as ImageSource
const RASPBERRY_PI_OS_LOGO = require('@/assets/os/raspberry-pi.png') as ImageSource

export function osLogoSource(
  logo: ServerOsLogoKey | null | undefined,
): ImageSource | null {
  if (logo === 'debian') return DEBIAN_LOGO
  if (logo === 'raspberry-pi-os') return RASPBERRY_PI_OS_LOGO
  return null
}
