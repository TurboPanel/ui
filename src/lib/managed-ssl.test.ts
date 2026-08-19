import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGED_SSL_MODE,
  describeManagedSslPolicy,
  isManagedSslMode,
  managedSslDsnParam,
  managedSslInheritLabel,
  managedSslModeHint,
  managedSslModeLabel,
  managedSslRequiresTls,
  managedSslVerifiesServer,
  MANAGED_SSL_MODES,
  resolveManagedSslMode,
  type ManagedSslMode,
} from '@/lib/managed-ssl'

describe('managed ssl modes', () => {
  it('accepts only the six canonical modes', () => {
    for (const mode of MANAGED_SSL_MODES) {
      expect(isManagedSslMode(mode)).toBe(true)
    }
    expect(isManagedSslMode('REQUIRE')).toBe(false)
    expect(isManagedSslMode('verify_full')).toBe(false)
    expect(isManagedSslMode(undefined)).toBe(false)
  })

  it('labels and hints every mode', () => {
    for (const mode of MANAGED_SSL_MODES) {
      expect(managedSslModeLabel(mode).length).toBeGreaterThan(0)
      expect(managedSslModeHint(mode).length).toBeGreaterThan(0)
    }
  })

  it('resolves service override, then org default, then the platform mode', () => {
    expect(resolveManagedSslMode(null, null)).toBe(DEFAULT_MANAGED_SSL_MODE)
    expect(resolveManagedSslMode(undefined, 'prefer')).toBe('prefer')
    // An explicit service value wins even when it loosens a strict org default.
    expect(resolveManagedSslMode('allow', 'verify-full')).toBe('allow')
  })

  it('only require and the verify modes refuse plaintext', () => {
    expect(MANAGED_SSL_MODES.map(managedSslRequiresTls)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ])
    expect(MANAGED_SSL_MODES.map(managedSslVerifiesServer)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ])
  })

  it('names what the inherit row resolves to', () => {
    expect(managedSslInheritLabel(null)).toBe('Organization default (Require)')
    expect(managedSslInheritLabel('verify-ca')).toBe(
      'Organization default (Verify CA)',
    )
    expect(managedSslInheritLabel(null, 'platform')).toBe(
      'Platform default (Require)',
    )
  })
})

describe('managedSslDsnParam', () => {
  it('uses libpq spellings for postgres', () => {
    expect(
      MANAGED_SSL_MODES.map((mode) => managedSslDsnParam('postgres', mode)),
    ).toEqual(MANAGED_SSL_MODES.map((mode) => `sslmode=${mode}`))
  })

  it('uses uppercase ssl-mode for the mysql family, collapsing allow and prefer', () => {
    for (const engine of ['mysql', 'mariadb']) {
      expect(
        MANAGED_SSL_MODES.map((mode) => managedSslDsnParam(engine, mode)),
      ).toEqual([
        'ssl-mode=DISABLED',
        'ssl-mode=PREFERRED',
        'ssl-mode=PREFERRED',
        'ssl-mode=REQUIRED',
        'ssl-mode=VERIFY_CA',
        'ssl-mode=VERIFY_IDENTITY',
      ])
    }
  })

  it('falls back to libpq spelling for an unknown engine', () => {
    expect(managedSslDsnParam(null, 'require')).toBe('sslmode=require')
  })
})

describe('describeManagedSslPolicy', () => {
  const view = (
    configured: ManagedSslMode | null,
    organizationDefault: ManagedSslMode | null,
  ) => ({
    configured,
    effective: resolveManagedSslMode(configured, organizationDefault),
    organizationDefault,
  })

  it('attributes the mode to the layer that set it', () => {
    expect(describeManagedSslPolicy('postgres', view(null, null)).source).toBe(
      'platform default',
    )
    expect(
      describeManagedSslPolicy('postgres', view(null, 'prefer')).source,
    ).toBe('organization default')
    expect(
      describeManagedSslPolicy('postgres', view('prefer', 'require')).source,
    ).toBe('service override')
  })

  it('reports enforcement and verification alongside the DSN parameter', () => {
    expect(describeManagedSslPolicy('postgres', view('verify-full', null)))
      .toEqual({
        param: 'sslmode=verify-full',
        enforcement: 'plaintext refused',
        source: 'service override',
        verifies: true,
      })
    expect(describeManagedSslPolicy('mysql', view('prefer', null))).toEqual({
      param: 'ssl-mode=PREFERRED',
      enforcement: 'plaintext allowed',
      source: 'service override',
      verifies: false,
    })
  })
})
