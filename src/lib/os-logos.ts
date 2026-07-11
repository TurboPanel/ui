import type { ImageSource } from 'expo-image'
import type { ServerOsLogoKey } from '@/lib/instance-api'

/** Bundled SVG assets — emitted as separate URLs (cacheable), not inline data URIs. */
const DEBIAN_LOGO = require('@/assets/os/debian.svg') as ImageSource
const RASPBERRY_PI_OS_LOGO = require('@/assets/os/raspberry-pi.svg') as ImageSource

export function osLogoSource(
  logo: ServerOsLogoKey | null | undefined,
): ImageSource | null {
  if (logo === 'debian') return DEBIAN_LOGO
  if (logo === 'raspberry-pi-os') return RASPBERRY_PI_OS_LOGO
  return null
}
