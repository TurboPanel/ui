import { describe, expect, it } from 'vitest'
import { isEffectivePrimary, primaryChangeNotice, withPrimary } from '@/lib/hostname-ingress'

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

  it('says nothing when the primary did not change', () => {
    expect(primaryChangeNotice({ ok: true, hostnames: [] })).toBeNull()
  })
})
