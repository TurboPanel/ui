import { describe, expect, it } from 'vitest'
import {
  PRIMARY_HOST_CONFIRM,
  applyConfirm,
  PLATFORM_CA_CONFIRM,
  isEffectivePrimary,
  primaryChangeNotice,
  primaryHostWouldChange,
  withPrimary,
} from '@/lib/hostname-ingress'

const rows = [
  { host: 'a.example.test', source: 'platform-ca' as const, uploadedCertId: null },
  { host: 'b.example.test', source: 'platform-ca' as const, uploadedCertId: null },
]

describe('primary choice', () => {
  it('treats the oldest name as primary until one is chosen', () => {
    expect(isEffectivePrimary(rows, 0)).toBe(true)
    expect(isEffectivePrimary(rows, 1)).toBe(false)
  })

  it('makes exactly one row primary', () => {
    const next = withPrimary(withPrimary(rows, 0), 1)
    expect(next.map((row) => row.isPrimary)).toEqual([false, true])
    expect(isEffectivePrimary(next, 0)).toBe(false)
    expect(isEffectivePrimary(next, 1)).toBe(true)
  })
})

describe('primaryChangeNotice', () => {
  it('warns that OAuth callbacks and webhooks need updating', () => {
    const notice = primaryChangeNotice({
      ok: true,
      hostnames: [],
      warnings: ['primary-origin-changed'],
      previousPrimaryOrigin: 'https://a.example.test:8443',
      primaryOrigin: 'https://a.example.test',
    })
    expect(notice).toContain('https://a.example.test:8443')
    expect(notice).toContain('OAuth callback URLs')
  })

  it('names passkeys only when the host changed', () => {
    const base = { ok: true, hostnames: [], previousPrimaryOrigin: 'https://a.example.test' }
    expect(
      primaryChangeNotice({
        ...base,
        warnings: ['primary-host-changed'],
        primaryOrigin: 'https://b.example.test',
      })
    ).toContain('Passkeys')
    expect(
      primaryChangeNotice({
        ...base,
        warnings: ['primary-origin-changed'],
        primaryOrigin: 'https://a.example.test:8443',
      })
    ).not.toContain('Passkeys')
  })

  it('says nothing when the primary did not change', () => {
    expect(primaryChangeNotice({ ok: true, hostnames: [] })).toBeNull()
  })
})

describe('primaryHostWouldChange', () => {
  it('is true only when the effective primary host differs', () => {
    expect(primaryHostWouldChange(rows, rows)).toBe(false)
    expect(primaryHostWouldChange(rows, withPrimary(rows, 1))).toBe(true)
    const portOnly = [{ ...rows[0], publicPort: 443 }, rows[1]]
    expect(primaryHostWouldChange(rows, portOnly)).toBe(false)
    expect(primaryHostWouldChange([], rows)).toBe(false)
  })
})

describe('applyConfirm', () => {
  it('asks nothing when neither change applies', () => {
    expect(applyConfirm(false, false)).toBeNull()
  })

  it('asks about the primary host alone', () => {
    expect(applyConfirm(true, false)).toEqual({
      title: 'Change the Primary Host',
      body: PRIMARY_HOST_CONFIRM,
      confirmLabel: 'Change Primary Host',
    })
  })

  it('asks about the Platform CA address alone', () => {
    expect(applyConfirm(false, true)?.title).toBe('Keep a Platform CA Address')
    expect(applyConfirm(false, true)?.body).toBe(PLATFORM_CA_CONFIRM)
  })

  it('lists both consequences in one dialog when both apply', () => {
    const confirm = applyConfirm(true, true)
    expect(confirm?.title).toBe('Change the Primary Host and Apply')
    expect(confirm?.body).toContain(PRIMARY_HOST_CONFIRM)
    expect(confirm?.body).toContain(PLATFORM_CA_CONFIRM)
    expect(confirm?.confirmLabel).toBe('Change and Apply')
  })
})
