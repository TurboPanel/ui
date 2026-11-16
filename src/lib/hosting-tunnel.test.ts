import { describe, expect, it } from 'vitest'
import { tunnelOnlyCertificateView, tunnelOnlyOf } from '@/lib/hosting-tunnel'

const path = (hostname: string, tunnelOnly: boolean) => ({
  hostname,
  tunnelId: 't1',
  tunnelName: 'edge',
  provider: 'cloudflare',
  tunnelOnly,
  originVerified: false,
  status: 'live',
})

describe('tunnelOnlyOf', () => {
  it('is tunnel-only when every name is a tunnel-only path of the hosting', () => {
    expect(tunnelOnlyOf(['A.example'], new Map(), { tunnels: [path('a.example', true)] })).toEqual({
      tunnelNames: ['edge'],
    })
  })

  it('is not when a name is also served directly or unknown', () => {
    expect(
      tunnelOnlyOf(['a.example'], new Map(), { tunnels: [path('a.example', false)] })
    ).toBeNull()
    expect(
      tunnelOnlyOf(['a.example', 'b.example'], new Map(), { tunnels: [path('a.example', true)] })
    ).toBeNull()
    expect(tunnelOnlyOf([], new Map())).toBeNull()
  })

  it('reads names from the organization lookup', () => {
    expect(tunnelOnlyOf(['a.example'], new Map([['a.example', 'edge']]))).toEqual({
      tunnelNames: ['edge'],
    })
  })
})

describe('tunnelOnlyCertificateView', () => {
  it('requests nothing and does not spin or warn', () => {
    const view = tunnelOnlyCertificateView({ tunnelNames: ['edge'] })
    expect(view.label).toBe('Internal certificate')
    expect(view.actions).toEqual([])
    expect(view.spinner).toBe(false)
    expect(view.lines.join(' ')).not.toMatch(/warn|Let’s Encrypt/)
  })
})
