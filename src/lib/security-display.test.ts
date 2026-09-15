import { describe, expect, it } from 'vitest'
import type { PasskeyRecord } from '@/lib/instance-api'
import {
  backupCodesLabel,
  backupCodesRunningLow,
  defaultPasskeyName,
  passkeyCreatedLabel,
  passkeyDeviceLabel,
  passkeyDisplayName,
  resolvePasskeyName,
  twoFactorStatusLabel,
} from './security-display'

function passkey(overrides: Partial<PasskeyRecord> = {}): PasskeyRecord {
  return {
    id: 'pk-1',
    name: 'Work laptop',
    createdAt: '2026-03-04T10:00:00.000Z',
    deviceType: 'multiDevice',
    isBackedUp: true,
    ...overrides,
  }
}

describe('passkeyDisplayName', () => {
  it('uses the operator label', () => {
    expect(passkeyDisplayName(passkey())).toBe('Work laptop')
  })

  it('falls back when the label is unset or blank', () => {
    expect(passkeyDisplayName(passkey({ name: null }))).toBe('Unnamed passkey')
    expect(passkeyDisplayName(passkey({ name: '   ' }))).toBe('Unnamed passkey')
  })
})

describe('passkeyDeviceLabel', () => {
  it('separates synced from merely multi-device', () => {
    expect(passkeyDeviceLabel(passkey())).toBe('Synced')
    expect(passkeyDeviceLabel(passkey({ isBackedUp: false }))).toBe(
      'Multi-device',
    )
  })

  it('names a device-bound credential', () => {
    expect(
      passkeyDeviceLabel(passkey({ deviceType: 'singleDevice', isBackedUp: false })),
    ).toBe('This device only')
  })

  it('falls back on the backup flag when the device type is absent', () => {
    expect(passkeyDeviceLabel(passkey({ deviceType: null }))).toBe('Synced')
    expect(
      passkeyDeviceLabel(passkey({ deviceType: null, isBackedUp: false })),
    ).toBe('Unknown')
  })
})

describe('passkeyCreatedLabel', () => {
  it('formats a timestamp', () => {
    expect(passkeyCreatedLabel(passkey())).not.toBe('Unknown')
  })

  it('reports an unusable timestamp rather than an em dash', () => {
    expect(passkeyCreatedLabel(passkey({ createdAt: '' }))).toBe('Unknown')
  })
})

describe('twoFactorStatusLabel', () => {
  it('reads as off when unset or disabled', () => {
    expect(twoFactorStatusLabel(undefined)).toBe('Not enabled')
    expect(
      twoFactorStatusLabel({
        enabled: false,
        method: null,
        backupCodesRemaining: 0,
        passkeys: [],
        linkedProviders: [],
      }),
    ).toBe('Not enabled')
  })

  it('names the method when enrolled', () => {
    expect(
      twoFactorStatusLabel({
        enabled: true,
        method: 'totp',
        backupCodesRemaining: 8,
        passkeys: [],
        linkedProviders: [],
      }),
    ).toBe('Authenticator app')
  })

  it('stays generic when enabled without a known method', () => {
    expect(
      twoFactorStatusLabel({
        enabled: true,
        method: null,
        backupCodesRemaining: 8,
        passkeys: [],
        linkedProviders: [],
      }),
    ).toBe('Enabled')
  })
})

describe('backupCodesLabel', () => {
  it('pluralizes and calls out exhaustion', () => {
    expect(backupCodesLabel(0)).toBe('No backup codes left')
    expect(backupCodesLabel(-1)).toBe('No backup codes left')
    expect(backupCodesLabel(1)).toBe('1 backup code left')
    expect(backupCodesLabel(8)).toBe('8 backup codes left')
  })
})

describe('backupCodesRunningLow', () => {
  it('warns at two or fewer', () => {
    expect(backupCodesRunningLow(2)).toBe(true)
    expect(backupCodesRunningLow(3)).toBe(false)
  })
})

describe('passkey naming', () => {
  it('builds a dated default', () => {
    const label = defaultPasskeyName(new Date('2026-03-04T10:00:00.000Z'))
    expect(label.startsWith('Passkey ')).toBe(true)
  })

  it('prefers a typed name and falls back on blanks', () => {
    const now = new Date('2026-03-04T10:00:00.000Z')
    expect(resolvePasskeyName('  Phone ', now)).toBe('Phone')
    expect(resolvePasskeyName('   ', now)).toBe(defaultPasskeyName(now))
  })
})
