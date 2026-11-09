import type { BadgeTone } from '@/components/ui'
import type { PinnedBy } from '@/lib/instance-api'

/** A control plane key fingerprint is 43 base64url characters (SHA-256, no padding). */
export const PANEL_FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const NEXT_KEY_HELP =
  'The next key is the one servers will accept after a rotation. Only the fingerprint is stored here; the private key stays offline with you.'

/**
 * Nothing is printed beside an install command to compare by eye: the command
 * carries the key inside it and the installer does the comparing.
 */
export const COMPARE_KEY_HELP =
  'The install command from Add Server carries the current key inside it. The installer checks that key against this control plane before it installs anything, and stops if they differ.'

export const NO_PANEL_KEY_HELP =
  'This server was installed without a control plane key and cannot tell this control plane from an impostor. Reinstall it with a fresh command.'

export const OTHER_KEY_HELP =
  'These servers report a control plane key that is not this one. Either they were pointed at another control plane or something is impersonating this one. If you did not expect this, reinstall them with a fresh command.'

/** "name (fingerprint)" for each server whose signed pin names another key. */
export function serversPinnedToAnotherKey(
  servers: readonly {
    id: string
    name: string | null
    pinReport?: { fingerprint: string; matches: boolean } | null
  }[]
): string[] {
  return servers
    .filter((server) => server.pinReport?.matches === false)
    .map((server) => `${server.name ?? server.id} (${server.pinReport?.fingerprint || 'no key'})`)
}

export function isPanelFingerprint(value: string): boolean {
  return PANEL_FINGERPRINT_PATTERN.test(value)
}

export type PinnedByDisplay = Readonly<{ label: string; tone: BadgeTone; help: string | null }>

/**
 * How a server's pin reads. `none` means no pin is recorded, which an older
 * control plane (or one that has not learned it yet) also reports, so it shows
 * nothing rather than a warning on every server.
 */
export function pinnedByDisplay(pinnedBy: PinnedBy | undefined): PinnedByDisplay | null {
  switch (pinnedBy) {
    case 'install':
      return { label: 'Pinned at Install', tone: 'ok', help: null }
    case 'upgrade':
      return { label: 'Pinned on Upgrade', tone: 'info', help: null }
    case 'unsafe':
      return { label: 'No Control Plane Key', tone: 'danger', help: NO_PANEL_KEY_HELP }
    default:
      return null
  }
}
