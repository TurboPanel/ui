import { describe, expect, it } from 'vitest'
import { buildComposeGraph, describeComposeGraph } from './graph'

function doc(data: Record<string, unknown>) {
  return { version: 1 as const, data, presentation: { keyOrder: [], comments: {} } }
}

describe('buildComposeGraph', () => {
  it('returns an empty graph for blank compose', () => {
    expect(buildComposeGraph(null)).toEqual({ nodes: [], edges: [], columns: 0, rows: 0 })
  })

  it('layers services by depends_on and draws dependency edges', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: { image: 'postgres:16' },
          web: { image: 'app:latest', depends_on: ['db'] },
        },
      }),
    )

    const db = graph.nodes.find((n) => n.id === 'service:db')
    const web = graph.nodes.find((n) => n.id === 'service:web')
    expect(db?.row).toBe(0)
    expect(web?.row).toBe(1)
    expect(graph.edges).toContainEqual({
      id: 'dep:db->web',
      kind: 'depends_on',
      from: 'service:db',
      to: 'service:web',
    })
  })

  it('supports depends_on as an object with condition keys', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: { image: 'postgres' },
          web: { image: 'app', depends_on: { db: { condition: 'service_healthy' } } },
        },
      }),
    )
    expect(graph.edges.some((edge) => edge.kind === 'depends_on')).toBe(true)
  })

  it('ignores depends_on entries that are not defined services', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'app', depends_on: ['missing'] },
        },
      }),
    )
    const web = graph.nodes.find((n) => n.id === 'service:web')
    expect(web?.row).toBe(0)
    expect(graph.edges).toEqual([])
  })

  it('is cycle-safe when services depend on each other', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          a: { image: 'a', depends_on: ['b'] },
          b: { image: 'b', depends_on: ['a'] },
        },
      }),
    )
    expect(graph.nodes.filter((n) => n.kind === 'service')).toHaveLength(2)
    expect(graph.rows).toBeGreaterThan(0)
  })

  it('adds a named network node per declared network with its members', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'app', networks: ['frontend'] },
          db: { image: 'postgres', networks: ['frontend', 'backend'] },
        },
        networks: { frontend: {}, backend: {} },
      }),
    )
    const frontend = graph.nodes.find((n) => n.id === 'network:frontend')
    const backend = graph.nodes.find((n) => n.id === 'network:backend')
    expect(frontend).toBeDefined()
    expect(backend).toBeDefined()
    expect(
      graph.edges.filter((edge) => edge.kind === 'network' && edge.to === 'network:frontend'),
    ).toHaveLength(2)
  })

  it('synthesizes an implicit default network when none is declared', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'app' },
          db: { image: 'postgres' },
        },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'network:default')).toBeDefined()
    expect(graph.edges.filter((edge) => edge.kind === 'network')).toHaveLength(2)
  })

  it('does not synthesize a default network for a single service', () => {
    const graph = buildComposeGraph(doc({ services: { web: { image: 'app' } } } as const))
    expect(graph.nodes.find((n) => n.kind === 'network')).toBeUndefined()
  })

  it('adds a volume node only for named volumes actually mounted', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: {
            image: 'postgres',
            volumes: ['data:/var/lib/postgresql/data', '/host/path:/etc/config'],
          },
        },
        volumes: { data: {} },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'volume:data')).toBeDefined()
    expect(graph.nodes.filter((n) => n.kind === 'volume')).toHaveLength(1)
    expect(graph.edges.filter((edge) => edge.kind === 'volume')).toHaveLength(1)
  })

  it('captures image and ports on service nodes', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'nginx:alpine', ports: ['8080:80'] },
        },
      }),
    )
    const web = graph.nodes.find((n) => n.id === 'service:web')
    expect(web?.image).toBe('nginx:alpine')
    expect(web?.ports).toEqual(['8080:80'])
  })

  it('formats long-syntax ports with numeric targets and target-only mappings', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: {
            image: 'app',
            ports: [
              { target: 3000, published: 8080 },
              { target: '5432' },
            ],
          },
        },
      }),
    )
    const web = graph.nodes.find((n) => n.id === 'service:web')
    expect(web?.ports).toEqual(['8080:3000', '5432'])
  })

  it('reads service kind from x-turbopanel metadata', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          site: {
            'x-turbopanel': { serviceKind: 'site', engine: 'nginx' },
          },
        },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'service:site')?.serviceKind).toBe(
      'site',
    )
  })

  it('marks services bound to a Git source, carrying the pinned branch', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          app: {
            'x-turbopanel': {
              serviceKind: 'node',
              principal: 'app',
              source: {
                sourceId: '123e4567-e89b-12d3-a456-426614174000',
                branch: 'main',
              },
            },
          },
          web: { image: 'nginx' },
        },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'service:app')?.gitSource).toEqual({
      branch: 'main',
    })
    expect(
      graph.nodes.find((n) => n.id === 'service:web')?.gitSource,
    ).toBeUndefined()
  })

  it('skips non-map services and volumes', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'nginx' },
          broken: 'not-a-map',
        },
        volumes: {
          data: {},
          also: 'not-a-map',
        },
      }),
    )
    expect(graph.nodes.filter((n) => n.kind === 'service')).toHaveLength(1)
    expect(graph.nodes.find((n) => n.kind === 'volume')).toBeUndefined()
  })

  it('reads long-syntax named volume mounts and map-form networks', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: {
            image: 'postgres',
            volumes: [
              { type: 'volume', source: 'data', target: '/var/lib/postgresql/data' },
              { type: 'bind', source: '/host', target: '/etc' },
              { type: 'volume', source: 'missing', target: '/tmp' },
              12,
            ],
            networks: { frontend: { aliases: ['db'] } },
          },
          web: { image: 'app', networks: true },
        },
        networks: { frontend: {} },
        volumes: { data: {} },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'volume:data')).toBeDefined()
    expect(graph.nodes.filter((n) => n.kind === 'volume')).toHaveLength(1)
    expect(
      graph.edges.some(
        (edge) => edge.kind === 'network' && edge.to === 'network:frontend',
      ),
    ).toBe(true)
  })

  it('includes a registry host in the service image label', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: { image: 'ghcr.io/org/app:1.2' },
          other: { image: 'nginx' },
        },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'service:web')?.image).toBe(
      'ghcr.io/org/app:1.2',
    )
    expect(graph.nodes.find((n) => n.id === 'service:other')?.image).toBe('nginx')
  })

  it('formats long-syntax ports when published is missing or null', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          web: {
            image: 'app',
            ports: [
              { target: 80, published: null },
              { target: 443 },
              { published: 8080 },
            ],
          },
        },
      }),
    )
    expect(graph.nodes.find((n) => n.id === 'service:web')?.ports).toEqual([
      '80',
      '443',
    ])
  })

  it('adds hosting nodes above services and shifts every row down', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: { image: 'postgres' },
          web: { image: 'app', depends_on: ['db'] },
        },
      }),
      { hostnamesByService: { web: 'app.example.com' } },
    )
    const host = graph.nodes.find((n) => n.id === 'host:web')
    expect(host).toMatchObject({ kind: 'hosting', name: 'app.example.com', row: 0 })
    expect(graph.nodes.find((n) => n.id === 'service:db')?.row).toBe(1)
    expect(graph.nodes.find((n) => n.id === 'service:web')?.row).toBe(2)
    expect(graph.edges).toContainEqual({
      id: 'host:app.example.com->web',
      kind: 'hosting',
      from: 'host:web',
      to: 'service:web',
    })
  })

  it('ignores hostnames for services not in the document and stays flat without any match', () => {
    const graph = buildComposeGraph(
      doc({ services: { web: { image: 'app' } } }),
      { hostnamesByService: { missing: 'gone.example.com' } },
    )
    expect(graph.nodes.find((n) => n.kind === 'hosting')).toBeUndefined()
    expect(graph.nodes.find((n) => n.id === 'service:web')?.row).toBe(0)
  })
})

describe('describeComposeGraph', () => {
  it('describes each service with dependencies, networks, and volumes', () => {
    const graph = buildComposeGraph(
      doc({
        services: {
          db: { image: 'postgres', volumes: ['data:/data'], networks: ['net'] },
          web: { image: 'app', depends_on: ['db'], networks: ['net'] },
        },
        networks: { net: {} },
        volumes: { data: {} },
      }),
    )
    const lines = describeComposeGraph(graph)
    expect(lines.find((line) => line.startsWith('web'))).toContain('depends on db')
    expect(lines.find((line) => line.startsWith('db'))).toContain('mounts volume data')
  })

  it('returns bare names when a service has no relationships', () => {
    const graph = buildComposeGraph(doc({ services: { solo: { image: 'app' } } }))
    expect(describeComposeGraph(graph)).toEqual(['solo'])
  })

  it('mentions the hostname a service is served at', () => {
    const graph = buildComposeGraph(
      doc({ services: { web: { image: 'app' } } }),
      { hostnamesByService: { web: 'app.example.com' } },
    )
    expect(describeComposeGraph(graph)).toEqual([
      'web — served at app.example.com',
    ])
  })

  it('mentions the Git repository a service builds from', () => {
    const source = { sourceId: '123e4567-e89b-12d3-a456-426614174000' }
    const serviceDoc = (binding: Record<string, unknown>) =>
      doc({
        services: {
          app: {
            'x-turbopanel': {
              serviceKind: 'node',
              principal: 'app',
              source: binding,
            },
          },
        },
      })
    expect(
      describeComposeGraph(buildComposeGraph(serviceDoc({ ...source, branch: 'main' }))),
    ).toEqual(['app — builds from a Git repository, branch main'])
    expect(describeComposeGraph(buildComposeGraph(serviceDoc(source)))).toEqual([
      'app — builds from a Git repository',
    ])
  })
})
