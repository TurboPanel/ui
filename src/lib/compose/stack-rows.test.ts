import { describe, expect, it } from 'vitest'
import type { ComposeGraph } from '@/lib/compose'
import { buildStackRows } from './stack-rows'

function graph(): ComposeGraph {
  return {
    nodes: [
      { id: 'n-db', kind: 'service', name: 'db', row: 2, column: 0, image: 'postgres:18' },
      {
        id: 'n-web',
        kind: 'service',
        name: 'web',
        row: 1,
        column: 0,
        serviceKind: 'site',
        gitSource: { repoLabel: 'storefront' },
        ports: ['8080', '9000', '9100'],
      },
      { id: 'n-net', kind: 'network', name: 'default', row: 3, column: 0 },
      { id: 'n-host', kind: 'hosting', name: 'shop.example.com', row: 0, column: 0 },
    ],
    edges: [],
    columns: 1,
    rows: 4,
  } as ComposeGraph
}

describe('buildStackRows', () => {
  it('lists only services, in diagram order, with source and reach', () => {
    const rows = buildStackRows(graph(), {
      hostnamesByService: { web: 'shop.example.com' },
      bindingFacts: { web: { keys: [], endpoint: 'db.internal:15432' } },
    })
    expect(rows.map((r) => r.name)).toEqual(['web', 'db'])
    expect(rows[0]).toEqual({
      name: 'web',
      kind: 'site',
      source: 'storefront',
      reach: 'shop.example.com',
      database: 'database db.internal:15432',
    })
    expect(rows[1]).toMatchObject({ source: 'postgres:18', reach: null, database: null })
  })

  it('falls back to published ports when there is no hostname', () => {
    const rows = buildStackRows(graph())
    expect(rows[0]?.reach).toBe('8080, 9000')
  })
})
