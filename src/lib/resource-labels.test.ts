import { describe, expect, it } from 'vitest'
import {
  environmentDisplayName,
  resolveServerLabel,
  serverDisplayName,
} from '@/lib/resource-labels'

const servers = [
  { id: 'srv-alpha-0001', name: 'web-01', hostname: 'web01.lan' },
  { id: 'srv-bravo-0002', name: '   ', hostname: 'db01.lan' },
  { id: 'srv-charlie-0003', name: null, hostname: null },
] as const

describe('serverDisplayName', () => {
  it('prefers name, then hostname, then a short id', () => {
    expect(serverDisplayName(servers[0])).toBe('web-01')
    expect(serverDisplayName(servers[1])).toBe('db01.lan')
    expect(serverDisplayName(servers[2])).toBe('srv-char')
  })
})

describe('resolveServerLabel', () => {
  it('resolves against the server list', () => {
    expect(resolveServerLabel('srv-alpha-0001', servers)).toBe('web-01')
  })

  it('returns null without an id and the id when unmatched', () => {
    expect(resolveServerLabel(null, servers)).toBeNull()
    expect(resolveServerLabel('   ', servers)).toBeNull()
    expect(resolveServerLabel('srv-missing', servers)).toBe('srv-missing')
    expect(resolveServerLabel('srv-alpha-0001', undefined)).toBe(
      'srv-alpha-0001',
    )
  })
})

describe('environmentDisplayName', () => {
  const env = { name: 'HTTP/HTTPS Ingress', serverId: 'srv-alpha-0001' }

  it('uses the environment name by default', () => {
    expect(environmentDisplayName(env, { servers })).toBe('HTTP/HTTPS Ingress')
    expect(environmentDisplayName({ name: '  ' })).toBe('Environment')
  })

  it('resolves the placed server for platform projects', () => {
    expect(
      environmentDisplayName(env, { servers, preferServer: true }),
    ).toBe('web-01')
  })

  it('falls back to the name until the placement resolves', () => {
    // Servers not loaded yet, unknown server, or an unplaced environment: the
    // component name is still better than an empty chip.
    expect(environmentDisplayName(env, { preferServer: true })).toBe(
      'HTTP/HTTPS Ingress',
    )
    expect(
      environmentDisplayName(
        { name: 'HTTP/HTTPS Ingress', serverId: 'srv-missing' },
        { servers, preferServer: true },
      ),
    ).toBe('HTTP/HTTPS Ingress')
    expect(
      environmentDisplayName(
        { name: 'HTTP/HTTPS Ingress', serverId: null },
        { servers, preferServer: true },
      ),
    ).toBe('HTTP/HTTPS Ingress')
  })
})
