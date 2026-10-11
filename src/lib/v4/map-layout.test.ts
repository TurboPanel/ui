import { describe, expect, it } from 'vitest'
import { mapLayout, MAP, type MapMode } from './map-layout'
import {
  SAMPLE_ENVIRONMENTS,
  sampleEnvironment,
  sampleMapInput,
  sampleProject,
} from './sample-projects.fixtures'

const MODES: readonly MapMode[] = ['env', 'base', 'diff']
const website = sampleProject('website')
const portal = sampleProject('portal')
const api = sampleProject('api')

function layoutOf(project: ReturnType<typeof sampleProject>, envId: string | null, mode: MapMode) {
  const env = envId === null ? null : sampleEnvironment(project, envId)
  return mapLayout(sampleMapInput(project, env, mode))
}

const inGutter = (x: number) => (x > 220 && x < 300) || (x > 620 && x < 700)
const horizontalInGutter = (x: number, w: number) =>
  (x >= 220 && x + w <= 300) || (x >= 620 && x + w <= 700)

describe('map layout geometry', () => {
  describe.each(SAMPLE_ENVIRONMENTS)('%s', (_name, project, env) => {
    it.each(MODES)('is a 1040 wide map with three bands (%s)', (mode) => {
      const layout = mapLayout(sampleMapInput(project, env, mode))
      expect(layout.w).toBe(1040)
      expect(layout.h).toBeGreaterThan(0)
      expect(layout.nodes.length).toBeGreaterThan(0)
      expect(layout.columns).toHaveLength(3)
      expect(layout.bands).toHaveLength(3)
    })

    it.each(MODES)('keeps every station inside the map and names who runs each app (%s)', (mode) => {
      const layout = mapLayout(sampleMapInput(project, env, mode))
      for (const node of layout.nodes) {
        if (node.kind === 'app') expect(node.runs).toMatch(/^(as |Runs inside its container)/)
        expect(node.x).toBeGreaterThanOrEqual(0)
        expect(node.x + node.w).toBeLessThanOrEqual(1040)
        expect(node.y).toBeGreaterThanOrEqual(0)
        expect(node.y + node.h).toBeLessThanOrEqual(layout.h)
      }
    })

    it.each(MODES)('only runs lines through the gutters (%s)', (mode) => {
      const layout = mapLayout(sampleMapInput(project, env, mode))
      for (const segment of layout.segments) {
        const ok =
          segment.orientation === 'v'
            ? inGutter(segment.x)
            : horizontalInGutter(segment.x, segment.w)
        expect(ok).toBe(true)
        expect(segment.w).toBeGreaterThanOrEqual(0)
        expect(segment.h).toBeGreaterThanOrEqual(0)
      }
    })

    it.each(MODES)('ends every arrowhead on the end of a line of its own kind (%s)', (mode) => {
      const layout = mapLayout(sampleMapInput(project, env, mode))
      for (const head of layout.heads) {
        const ends = layout.segments.some(
          (s) =>
            s.orientation === 'h' && s.kind === head.kind && s.y === head.y && s.x + s.w === head.x,
        )
        expect(ends).toBe(true)
      }
    })

    it.each(MODES)('never repeats a line or an arrowhead (%s)', (mode) => {
      const layout = mapLayout(sampleMapInput(project, env, mode))
      const lines = layout.segments.map(
        (s) => `${s.orientation}-${s.kind}-${s.x}-${s.y}-${s.w}-${s.h}`,
      )
      const heads = layout.heads.map((h) => `${h.kind}-${h.x}-${h.y}`)
      expect(new Set(lines).size).toBe(lines.length)
      expect(new Set(heads).size).toBe(heads.length)
    })
  })

  it('never lets two stations of a band overlap', () => {
    for (const [, project, env] of SAMPLE_ENVIRONMENTS) {
      const layout = mapLayout(sampleMapInput(project, env, 'env'))
      for (const column of layout.columns) {
        const ys = column.nodes.map((node) => node.y)
        expect(new Set(ys).size).toBe(ys.length)
      }
    }
  })

  it('grows taller with more apps and never shrinks below the top margin', () => {
    const many = {
      ...sampleMapInput(api, sampleEnvironment(api, 'production'), 'env'),
      services: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        name: `s${i}`,
        kind: 'container' as const,
        image: 'x',
      })),
      links: [],
      domains: [],
      volumes: [],
    }
    expect(mapLayout(many).h).toBeGreaterThanOrEqual(MAP.top + 10 * MAP.pitch)
    const none = mapLayout({ ...many, services: [] })
    expect(none.h).toBe(MAP.top + MAP.pitch + 8)
  })
})

describe('map words', () => {
  it('describes the website production map', () => {
    const layout = layoutOf(website, 'production', 'env')
    expect(layout.aria).toBe('Map of Production: 2 domains, 1 app, 1 data store')
    const app = layout.nodes.find((node) => node.kind === 'app')
    expect(app?.aria).toBe(
      'web, Node.js app, running, runs as website, shows turbopanel.io, uses next-cache',
    )
    expect(app?.runs).toBe('as website')
    expect(app?.jobsLabel).toBe('')
    expect(app?.status).toEqual({ key: 'running', label: 'Running' })
    expect(app?.target).toEqual({ kind: 'service', id: 'web' })
  })

  it('tags a changed app with the environment change', () => {
    const tag = layoutOf(website, 'testing', 'env').nodes.find((n) => n.kind === 'app')
    expect(tag?.tags).toEqual(['Testing change'])
    expect(tag?.changed).toBe(true)
    expect(tag?.removed).toBe(false)
  })

  it('names what changed in the Differences view', () => {
    const app = layoutOf(website, 'testing', 'diff').nodes.find((n) => n.kind === 'app')
    expect(app?.tags).toEqual(['Changed: start command, Linux user'])
  })

  it('tags an environment against the Base too, but draws the Base itself', () => {
    const layout = layoutOf(website, 'testing', 'base')
    expect(layout.aria).toMatch(/^Map of the Base/)
    expect(layout.nodes.filter((n) => n.kind === 'domain')).toHaveLength(0)
    expect(layout.nodes.find((n) => n.kind === 'app')?.tags).toEqual(['Testing change'])
  })

  it('has no tag on an app the environment does not change', () => {
    const app = layoutOf(website, 'production', 'diff').nodes.find((n) => n.kind === 'app')
    expect(app?.tags).toEqual([])
    expect(app?.changed).toBe(false)
  })

  it('says domains are set per environment on the Base map', () => {
    const layout = layoutOf(portal, null, 'base')
    expect(layout.bands[0]?.note).toBe('Domains are set per environment')
    expect(layout.aria).toMatch(/the Base/)
    expect(layout.envName).toBe('Base')
    expect(layout.columns[0]?.emptyText).toBe('Set per environment')
    expect(layout.changeCount).toBe(0)
  })

  it('draws the Base apps without status', () => {
    const app = layoutOf(portal, null, 'base').nodes.find((n) => n.kind === 'app')
    expect(app?.status).toBeNull()
    expect(app?.aria).toBe('app, Website, runs as portal, uses postgres')
    expect(app?.jobsLabel).toBe('1 job')
  })

  it('marks a removed app in the Differences view', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'testing'), 'diff')
    const removed = mapLayout({
      ...input,
      changes: [
        {
          key: 'svc:web',
          area: 'services',
          label: 'web',
          short: 'web',
          serviceId: 'web',
          serviceName: 'web',
          baseValue: 'x',
          envValue: 'Not set',
          added: false,
          removed: true,
          envName: 'Testing',
          tag: 'Testing change',
        },
      ],
    })
    const app = removed.nodes.find((n) => n.kind === 'app')
    expect(app).toMatchObject({ removed: true, changed: false, tags: ['Removed in Testing'] })
  })

  it('labels the empty bands', () => {
    const empty = mapLayout({
      ...sampleMapInput(website, sampleEnvironment(website, 'production'), 'env'),
      services: [],
      domains: [],
      volumes: [],
      links: [],
    })
    expect(empty.bands[0]?.note).toBe('No domains yet')
    expect(empty.bands[1]?.note).toBe('No apps yet')
    expect(empty.bands[2]?.note).toBe('')
    expect(empty.columns.map((c) => c.emptyText)).toEqual(['No domains yet', 'No apps yet', 'None'])
    expect(empty.counts).toEqual({ domains: 0, apps: 0, data: 0 })
    expect(empty.aria).toBe('Map of Production: 0 domains, 0 apps, 0 data stores')
  })

  it('has a legend for the three kinds of line', () => {
    expect(layoutOf(website, 'production', 'env').legend.map((l) => l.kind)).toEqual([
      'https',
      'internal',
      'data',
    ])
  })
})

describe('map of the example api', () => {
  const layout = layoutOf(api, 'production', 'env')

  it('counts apps, data and draws internal lines', () => {
    expect(layout.counts).toEqual({ domains: 1, apps: 2, data: 3 })
    expect(layout.segments.some((s) => s.kind === 'internal')).toBe(true)
    expect(layout.segments.some((s) => s.kind === 'data')).toBe(true)
    expect(layout.segments.some((s) => s.kind === 'https')).toBe(true)
  })

  it('draws containers as running inside their container, stores and databases by kind', () => {
    const byName = Object.fromEntries(layout.nodes.map((n) => [n.name, n]))
    expect(byName.api?.runs).toBe('Runs inside its container')
    expect(byName.redis).toMatchObject({
      kind: 'store',
      sub: 'redis:8',
      runs: 'Runs inside its container',
      aria: 'redis, data container redis:8, running',
    })
    expect(byName.postgres).toMatchObject({
      kind: 'db',
      sub: 'postgres · PostgreSQL 17',
      runs: '',
      aria: 'postgres, database PostgreSQL 17, running',
    })
    expect(byName['redis-data']).toMatchObject({
      kind: 'volume',
      sub: '64 MB · backed up today 01:30',
      aria: 'redis-data, storage, 64 MB, backed up today 01:30',
      target: { kind: 'volume', id: 'vol0' },
    })
  })

  it('lists what each station is joined to, for the phone form', () => {
    const appsColumn = layout.columns[1]
    expect(appsColumn?.key).toBe('apps')
    expect(appsColumn?.nodes[0]?.connections.length).toBeGreaterThanOrEqual(2)
    const apiNode = layout.nodes.find((n) => n.name === 'api')
    expect(apiNode?.connections).toEqual(['<- api.acme.com', '-> postgres', '-> redis'])
    const redis = layout.nodes.find((n) => n.name === 'redis')
    expect(redis?.connections).toEqual(['<- api', '<- worker'])
  })

  it('puts the web service first and lines the domain up with it', () => {
    const domain = layout.nodes.find((n) => n.kind === 'domain')
    const app = layout.nodes.find((n) => n.name === 'api')
    expect(domain?.y).toBe(MAP.top + (MAP.slot - MAP.h.domain) / 2)
    expect(app?.y).toBe(MAP.top + (MAP.slot - MAP.h.app) / 2)
  })
})

describe('map details', () => {
  it('shows a volume that has no backup and one with no matching service', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'production'), 'env')
    const layout = mapLayout({
      ...input,
      volumes: [
        { name: 'cache', mount: 'web:/c', size: '1 MB', lastBackup: null },
        { name: 'loose', mount: 'nothing:/l', size: '2 MB', lastBackup: null },
      ],
    })
    const cache = layout.nodes.find((n) => n.name === 'cache')
    expect(cache?.sub).toBe('1 MB · no backups')
    expect(layout.nodes.find((n) => n.name === 'web')?.aria).toContain('uses cache')
    expect(layout.nodes.find((n) => n.name === 'loose')?.connections).toEqual([])
  })

  it('joins a domain to the app it names, and to the first web app when it names none', () => {
    const input = sampleMapInput(api, sampleEnvironment(api, 'production'), 'env')
    const second = input.services.filter((s) => s.kind !== 'database')[1]
    const layout = mapLayout({
      ...input,
      domains: [
        { host: 'one.example.com', status: { key: 'ok', label: 'Secure' }, serviceId: second?.id },
        { host: 'two.example.com', status: { key: 'ok', label: 'Secure' }, serviceId: 'not-an-app' },
        { host: 'three.example.com', status: { key: 'ok', label: 'Secure' } },
      ],
    })
    const aria = (host: string) => layout.nodes.find((n) => n.name === host)?.aria
    expect(aria('one.example.com')).toContain(`shows ${second?.name}`)
    expect(aria('two.example.com')).toBe(aria('three.example.com')?.replace('three', 'two'))
  })

  it('says only what is known about a volume', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'production'), 'env')
    const layout = mapLayout({
      ...input,
      volumes: [
        { name: 'size-only', mount: 'web:/a', size: '3 MB', lastBackup: undefined },
        { name: 'backup-only', mount: 'web:/b', size: null, lastBackup: 'Today 04:00' },
        { name: 'mount-only', mount: 'web:/uploads', size: null, lastBackup: undefined },
        { name: 'nothing', mount: '', size: null, lastBackup: undefined },
      ],
    })
    const node = (name: string) => layout.nodes.find((n) => n.name === name)
    expect(node('size-only')).toMatchObject({ sub: '3 MB', aria: 'size-only, storage, 3 MB' })
    expect(node('backup-only')?.sub).toBe('backed up today 04:00')
    expect(node('mount-only')).toMatchObject({ sub: 'web:/uploads', aria: 'mount-only, storage, web:/uploads' })
    expect(node('nothing')).toMatchObject({ sub: '', aria: 'nothing, storage' })
  })

  it('does not say who an app runs as when that is not known', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'production'), 'env')
    const unknown = {
      runsInContainer: false,
      user: '',
      label: 'Linux user not set',
      short: '',
      source: 'base' as const,
      sourceLabel: '',
      access: '',
      hasAccess: false,
    }
    const app = mapLayout({ ...input, runsAs: () => unknown }).nodes.find((n) => n.kind === 'app')
    expect(app?.aria).not.toContain('runs as')
    expect(app?.runs).toBe('')
  })

  it('marks an app the environment adds in the Differences view', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'testing'), 'diff')
    const layout = mapLayout({
      ...input,
      changes: [
        {
          key: 'svc:web',
          area: 'services',
          label: 'web',
          short: 'web',
          serviceId: 'web',
          serviceName: 'web',
          baseValue: 'Not set',
          envValue: 'node',
          added: true,
          removed: false,
          envName: 'Testing',
          tag: 'Testing change',
        },
      ],
    })
    const app = layout.nodes.find((n) => n.kind === 'app')
    expect(app).toMatchObject({ changed: true, removed: false, tags: ['Added in Testing'] })
  })

  it('draws a database without an engine and a link to a missing station', () => {
    const input = sampleMapInput(portal, sampleEnvironment(portal, 'production'), 'env')
    const layout = mapLayout({
      ...input,
      services: [
        { id: 'app', name: 'app', kind: 'site', web: true },
        { id: 'db', name: 'db', kind: 'database' },
      ],
      links: [{ from: 'app', to: 'ghost', kind: 'data' }, { from: 'gone', to: 'db', kind: 'data' }],
    })
    const db = layout.nodes.find((n) => n.name === 'db')
    expect(db?.sub).toBe('db')
    expect(db?.aria).toBe('db, database, running')
    expect(layout.nodes.find((n) => n.name === 'app')?.aria).toContain('uses ghost')
    expect(db?.connections).toEqual(['<- gone'])
  })

  it('leaves out the status of an environment that cannot be reached', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'production'), 'env')
    const layout = mapLayout({ ...input, status: () => null })
    expect(layout.nodes.find((n) => n.kind === 'app')?.aria).toBe(
      'web, Node.js app, runs as website, shows turbopanel.io, uses next-cache',
    )
  })

  it('does not draw domains when there is no app to show', () => {
    const input = sampleMapInput(website, sampleEnvironment(website, 'production'), 'env')
    const layout = mapLayout({ ...input, services: [], volumes: [] })
    expect(layout.segments).toEqual([])
    expect(layout.nodes.find((n) => n.kind === 'domain')?.aria).toBe('turbopanel.io, domain, secure')
  })
})
