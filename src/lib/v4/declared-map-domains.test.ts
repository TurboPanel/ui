import { describe, expect, it } from 'vitest'
import type { ConfigViewSide } from '@/lib/instance-api'
import { withDeclaredDomains } from './declared-map-domains'
import type { MapInput } from './map-layout'

function side(rows: Record<string, readonly string[]>): ConfigViewSide {
  return {
    services: Object.entries(rows).map(([name, hosts]) => ({
      name,
      rows: hosts.map((value) => ({ area: 'domain', value })),
    })),
  } as unknown as ConfigViewSide
}

function input(overrides: Partial<MapInput> = {}): MapInput {
  return {
    mode: 'env',
    envName: 'production',
    services: [],
    domains: [],
    volumes: [],
    links: [],
    changes: [],
    ...overrides,
  } as unknown as MapInput
}

describe('withDeclaredDomains', () => {
  it('adds a hostname saved without deploying, marked not deployed yet', () => {
    const result = withDeclaredDomains(input(), side({ site: ['example.com'] }))
    expect(result.domains).toEqual([
      {
        host: 'example.com',
        status: { key: 'never', label: 'Not deployed yet' },
        serviceId: 'site',
      },
    ])
  })

  it('keeps a deployed hostname as it is and adds each declared one once', () => {
    const deployed = {
      host: 'Example.com',
      status: { key: 'ok', label: 'Secure' },
      serviceId: 'site',
    }
    const result = withDeclaredDomains(
      input({ domains: [deployed] }),
      side({ site: ['example.com', 'www.example.com/blog'], api: ['www.example.com'] })
    )
    expect(result.domains.map((domain) => domain.host)).toEqual(['Example.com', 'www.example.com'])
    expect(result.domains[0]).toBe(deployed)
  })

  it('draws no hostnames on the Base view', () => {
    const base = input({ mode: 'base' })
    expect(withDeclaredDomains(base, side({ site: ['example.com'] }))).toBe(base)
  })
})
