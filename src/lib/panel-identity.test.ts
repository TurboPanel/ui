import { describe, expect, it } from 'vitest'
import {
  COMPARE_KEY_HELP,
  isPanelFingerprint,
  pinnedByDisplay,
  serversNotRotatable,
  serversPinnedToAnotherKey,
} from './panel-identity'

const FINGERPRINT = 'A'.repeat(43)

describe('isPanelFingerprint', () => {
  it('accepts exactly 43 base64url characters', () => {
    expect(isPanelFingerprint(FINGERPRINT)).toBe(true)
    expect(isPanelFingerprint('A'.repeat(42))).toBe(false)
    expect(isPanelFingerprint('A'.repeat(44))).toBe(false)
    expect(isPanelFingerprint(`${'A'.repeat(42)}+`)).toBe(false)
  })
})

describe('COMPARE_KEY_HELP', () => {
  it('says the installer checks the key, and asks nobody to compare by eye', () => {
    expect(COMPARE_KEY_HELP).toBe(
      'The install command from Add Server carries the current key inside it. The installer checks that key against this control plane before it installs anything, and stops if they differ.'
    )
    expect(COMPARE_KEY_HELP).not.toMatch(/printed|compare/i)
  })
})

describe('pinnedByDisplay', () => {
  it('names each pin in title case', () => {
    expect(pinnedByDisplay('install')?.label).toBe('Pinned at Install')
    expect(pinnedByDisplay('upgrade')?.label).toBe('Pinned on Upgrade')
    expect(pinnedByDisplay('unsafe')?.label).toBe('No Control Plane Key')
  })

  it('warns only for a server installed without a key', () => {
    expect(pinnedByDisplay('unsafe')?.tone).toBe('danger')
    expect(pinnedByDisplay('unsafe')?.help).toContain('Reinstall it with a fresh command')
    expect(pinnedByDisplay('install')?.help).toBeNull()
  })

  it('shows nothing when no pin is recorded or the control plane is older', () => {
    expect(pinnedByDisplay('none')).toBeNull()
    expect(pinnedByDisplay(undefined)).toBeNull()
  })
})

describe('serversPinnedToAnotherKey', () => {
  it('lists only servers whose report does not match, by name or id', () => {
    const fp = 'X'.repeat(43)
    expect(
      serversPinnedToAnotherKey([
        { id: 's1', name: 'kappa', pinReport: { fingerprint: fp, matches: false } },
        { id: 's2', name: null, pinReport: { fingerprint: '', matches: false } },
        { id: 's3', name: 'omicron', pinReport: { fingerprint: fp, matches: true } },
        { id: 's4', name: 'lambda', pinReport: null },
        { id: 's5', name: 'mu' },
      ])
    ).toEqual([`kappa (${fp})`, 's2 (no key)'])
  })
})

describe('serversNotRotatable', () => {
  it('lists pinned servers with no rotation passkeys, reported or never reported', () => {
    expect(
      serversNotRotatable([
        // Reported a pin with no passkeys.
        { id: 's1', name: 'kappa', pinnedBy: 'install', pinPasskeys: '' },
        // Pinned, never reported them (an older daemon).
        { id: 's2', name: null, pinnedBy: 'upgrade', pinPasskeys: null },
        // Holds the passkeys.
        { id: 's3', name: 'omicron', pinnedBy: 'install', pinPasskeys: 'H'.repeat(43) },
        // Not pinned at all: it has its own warning.
        { id: 's4', name: 'sigma', pinnedBy: 'unsafe', pinPasskeys: null },
        { id: 's5', name: 'tau', pinnedBy: 'none', pinPasskeys: null },
        // An older control plane sends no such field.
        { id: 's6', name: 'lambda', pinnedBy: 'install' },
      ])
    ).toEqual(['kappa', 's2'])
  })
})
