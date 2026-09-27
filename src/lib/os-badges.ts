import type { ServerOsLogoKey } from '@/lib/instance-api'

/**
 * A lettered badge for an OS whose mark we do not ship. Raspberry Pi
 * trademarks are not licensed for this use (`assets/os/NOTICE.md`), so the
 * OS column shows our own "RPi / OS" badge — in the same slot as the Debian
 * logo — instead of a two-line product name that breaks the row.
 */
export type OsTextBadge = Readonly<{
  /** Stacked lines inside the badge, top to bottom. */
  lines: readonly string[]
  /** Screen-reader label: the full product name. */
  label: string
}>

const RASPBERRY_PI_OS_BADGE: OsTextBadge = {
  lines: ['RPi', 'OS'],
  label: 'Raspberry Pi OS',
}

export function osTextBadge(
  logo: ServerOsLogoKey | null | undefined,
): OsTextBadge | null {
  if (logo === 'raspberry-pi-os') return RASPBERRY_PI_OS_BADGE
  return null
}
