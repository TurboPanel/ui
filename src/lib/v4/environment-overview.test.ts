import { describe, expect, it } from 'vitest'
import type { ServiceRecord, ServiceRunStateName } from '@/lib/instance-api'
import {
  appRows,
  certificateKey,
  changeRows,
  databasesOf,
  dataRows,
  domainsOf,
  engineName,
  linksOf,
  mapInputOf,
  recordIds,
  relationCard,
  runsAsOf,
  runStatusKey,
  shortLabel,
  sideServices,
  volumesOf,
} from './environment-overview'
import {
  CHANGES,
  configView,
  container,
  overviewSource,
  principal,
  row,
  serviceRecord,
  tlsRecord,
  viewService,
} from './environment-overview.fixtures'
import { mapLayout } from './map-layout'

describe('changeRows', () => {
  const rows = changeRows(CHANGES, 'Staging')
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))

  it('turns a field change into a service row with a lower-case short name', () => {
    expect(byKey['svc:web:command']).toMatchObject({
      area: 'service',
      label: 'Start command',
      short: 'start command',
      serviceId: 'web',
      serviceName: 'web',
      baseValue: 'node a.js',
      envValue: 'node b.js',
      added: false,
      removed: false,
      tag: 'Staging change',
      envName: 'Staging',
    })
  })

  it('marks a whole service that the environment removes', () => {
    expect(byKey['svc:old']).toMatchObject({ area: 'services', removed: true, envValue: 'Not set' })
  })

  it('keeps a variable name as it is and says what is absent', () => {
    expect(byKey['var:API_URL']).toMatchObject({
      area: 'variables',
      short: 'API_URL',
      serviceId: null,
      added: true,
      baseValue: 'Not set',
    })
  })

  it('never shows a masked value', () => {
    expect(byKey['var:TOKEN']).toMatchObject({ baseValue: 'Hidden', envValue: 'Hidden' })
  })

  it('files Linux users and domains under their own areas', () => {
    const [user, domain] = changeRows(
      [
        { ...CHANGES[0]!, key: 'user:deploy', area: 'linuxUser', label: 'Linux user', field: null, serviceName: null },
        { ...CHANGES[0]!, key: 'svc:web:domain', area: 'domain', label: 'Domain' },
      ],
      'Staging',
    )
    expect(user).toMatchObject({ area: 'users', short: 'Linux user', serviceId: null })
    expect(domain).toMatchObject({ area: 'service', short: 'domain' })
  })

  it('shows "Not set" for a missing value that is not masked', () => {
    const [change] = changeRows([{ ...CHANGES[0]!, baseValue: null }], 'Staging')
    expect(change?.baseValue).toBe('Not set')
  })
})

describe('shortLabel', () => {
  it.each([
    ['Start command', 'start command'],
    ['Linux user', 'Linux user'],
    ['PHP version', 'PHP version'],
    ['Environment variable PORT', 'environment variable PORT'],
    ['A', 'a'],
  ])('%s -> %s', (label, short) => {
    expect(shortLabel(label)).toBe(short)
  })
})

describe('services', () => {
  const source = overviewSource()

  it('names services the way the config view does and marks the ones that answer a domain', () => {
    const services = sideServices(source, source.view.effective)
    expect(services.map((s) => s.id)).toEqual(['web', 'blog', 'api', 'redis'])
    expect(services[0]).toMatchObject({ kind: 'node', web: true })
    expect(services[1]).not.toHaveProperty('web')
    expect(services[2]).toMatchObject({ image: 'ghcr.io/acme/api:1' })
    expect(services[3]).toMatchObject({ image: 'redis:8' })
  })

  it('finds the service record for each name', () => {
    const ids = recordIds(
      overviewSource({
        services: [{ ...overviewSource().services[0]!, id: 'record-web' }],
        view: configView({
          effective: { ...configView().effective, services: [viewService('api', 'container', [], { serviceId: 'x-api' })] },
        }),
      }),
    )
    expect(ids.get('web')).toBe('record-web')
    expect(ids.get('api')).toBe('x-api')
  })

  it('says a service answers a domain when it has a hosting row but no domain row', () => {
    const view = configView({
      effective: { ...configView().effective, services: [viewService('shop', 'site', [])] },
    })
    const withHosting = overviewSource({ view, hostings: { 's-shop': [{ ...overviewSource().hostings['s-web']![0]!, serviceId: 's-shop' }] } })
    expect(sideServices(withHosting, view.effective)[0]).toMatchObject({ web: true })
    expect(sideServices(overviewSource({ view, hostings: {} }), view.effective)[0]).not.toHaveProperty('web')
  })
})

describe('runStatusKey', () => {
  const containers = overviewSource().containers
  it('is unknown to the screen until the containers load', () => {
    expect(runStatusKey('s-web', undefined)).toBeNull()
  })
  it.each([
    ['s-web', 'running'],
    ['s-blog', 'busy'],
    ['s-redis', 'stopped'],
    ['s-api', 'never'],
    [undefined, 'never'],
  ])('%s -> %s', (id, key) => {
    expect(runStatusKey(id, containers)).toBe(key)
  })
  it('takes the daemon report over the stored container status', () => {
    const report = (state: ServiceRunStateName): ServiceRecord[] => [
      { ...serviceRecord('web'), runState: { state, running: state === 'running', restartCount: 3, lastError: null, asOf: '2026-10-05T12:00:00Z' } },
    ]
    expect(runStatusKey('s-web', containers, report('crashing'))).toBe('crashing')
    expect(runStatusKey('s-web', containers, report('stopped_after_crashes'))).toBe('crashstop')
    expect(runStatusKey('s-web', containers, report('starting'))).toBe('busy')
    expect(runStatusKey('s-web', undefined, report('crashing'))).toBe('crashing')
  })
  it('falls back to the containers when the report is unknown or for another app', () => {
    const unknown: ServiceRecord[] = [
      { ...serviceRecord('web'), runState: { state: 'unknown', running: false, restartCount: 0, lastError: null, asOf: '2026-10-05T12:00:00Z' } },
    ]
    expect(runStatusKey('s-web', containers, unknown)).toBe('running')
    expect(runStatusKey('s-blog', containers, unknown)).toBe('busy')
  })
  it('ignores ingress containers and reads an odd state as unknown', () => {
    expect(runStatusKey('s-x', [container('x', 'running', 'ingress')])).toBe('never')
    expect(runStatusKey('s-x', [container('x', 'weird')])).toBe('unknown')
  })
})

describe('domains, volumes and databases', () => {
  const source = overviewSource()

  it('reads a certificate word only from a pinned certificate row', () => {
    const tls = [
      tlsRecord('ok', 'upload', 'ready'),
      tlsRecord('managed', 'lets_encrypt', 'managed'),
      tlsRecord('wait', 'lets_encrypt', 'pending'),
      tlsRecord('self', 'self_signed', 'ready'),
      tlsRecord('old', 'upload', 'expired'),
    ]
    expect(certificateKey('ok', tls)).toBe('ok')
    expect(certificateKey('managed', tls)).toBe('ok')
    expect(certificateKey('wait', tls)).toBe('issuing')
    expect(certificateKey('self', tls)).toBe('test')
    expect(certificateKey('old', tls)).toBe('renewal_failed')
    expect(certificateKey('missing', tls)).toBe('unknown')
    expect(certificateKey('ok', undefined)).toBe('unknown')
    expect(certificateKey(null, tls)).toBe('test')
    expect(certificateKey(undefined, undefined)).toBe('test')
  })

  it('lists each domain once, skips blank names, and names the certificate only from what is pinned', () => {
    expect(domainsOf(source)).toEqual([
      { host: 'shop.example.com', status: { key: 'ok', label: 'Secure' }, serviceId: 'web' },
    ])
    const noTls = domainsOf(overviewSource({ tls: undefined }))
    expect(noTls[0]?.status).toEqual({ key: 'unknown', label: 'Unknown' })
    const unpinned = domainsOf(overviewSource({ hostings: { 's-web': [{ ...source.hostings['s-web']![0]!, tlsId: null }] } }))
    expect(unpinned[0]?.status).toEqual({ key: 'test', label: 'Test certificate (browsers warn)' })
  })

  it('skips a service that has no saved row yet', () => {
    const view = configView({
      effective: { ...configView().effective, services: [viewService('new', 'node', [], { serviceId: null })] },
    })
    expect(domainsOf(overviewSource({ view }))).toEqual([])
  })

  it('leaves a volume size and last backup unknown', () => {
    expect(volumesOf(source)).toEqual([
      { name: 'uploads', mount: 'web:/app/uploads', size: null, lastBackup: undefined },
      { name: 'empty', mount: '', size: null, lastBackup: undefined },
    ])
    const orphan = overviewSource({ services: [] })
    expect(volumesOf(orphan)[0]?.mount).toBe('s-web:/app/uploads')
  })

  it('names engines in plain words', () => {
    expect(engineName('postgres')).toBe('PostgreSQL')
    expect(engineName('MySQL')).toBe('MySQL')
    expect(engineName('weird')).toBe('weird')
    expect(engineName(null)).toBeUndefined()
  })

  it('lists each managed database once', () => {
    expect(databasesOf(source)).toEqual([
      { id: 'db:shopdb', name: 'shopdb', kind: 'database', engine: 'PostgreSQL' },
      { id: 'db:ghostdb', name: 'ghostdb', kind: 'database', engine: 'weird' },
    ])
    expect(databasesOf(overviewSource({ bindings: [{ ...source.bindings[0]!, engine: null }] }))[0]).not.toHaveProperty('engine')
  })
})

describe('linksOf', () => {
  const source = overviewSource()
  const services = [...sideServices(source, source.view.effective), ...databasesOf(source)]

  it('joins an app to a data container it depends on, in both compose shapes', () => {
    const links = linksOf(source, source.view.effective, services, false)
    expect(links).toEqual([
      { from: 'web', to: 'redis', kind: 'data' },
      { from: 'api', to: 'redis', kind: 'data' },
    ])
  })

  it('adds database bindings and skips a binding whose service is gone', () => {
    const links = linksOf(source, source.view.effective, services, true)
    expect(links).toContainEqual({ from: 'web', to: 'db:shopdb', kind: 'data' })
    expect(links).toContainEqual({ from: 'api', to: 'db:shopdb', kind: 'data' })
    expect(links.some((l) => l.to === 'db:ghostdb')).toBe(false)
    expect(links.some((l) => l.to === 'db:plain')).toBe(false)
  })

  it('has no lines for an app the side does not list', () => {
    const only = linksOf(source, { ...source.view.effective, services: [] }, services, false)
    expect(only).toEqual([])
  })
})

describe('runsAsOf', () => {
  const source = overviewSource()
  const [web, blog, api] = sideServices(source, source.view.effective)

  it('lets a container run inside its container', () => {
    expect(runsAsOf(source, api!, true)).toMatchObject({ runsInContainer: true, label: 'Runs inside its container' })
  })

  it('reads the Linux user from the row, with where the choice comes from', () => {
    expect(runsAsOf(source, web!, true)).toMatchObject({
      user: 'website',
      label: 'Runs as website',
      short: 'as website',
      source: 'env',
      sourceLabel: 'Staging change',
      access: 'SFTP on',
      hasAccess: true,
    })
  })

  it('falls back to the Linux user the project lists for the service', () => {
    expect(runsAsOf(source, blog!, true)).toMatchObject({
      user: 'blogger',
      source: 'base',
      sourceLabel: 'Base',
      access: 'No sign-in',
      hasAccess: false,
    })
  })

  it('does not invent a user', () => {
    const none = overviewSource({ principals: [] })
    expect(runsAsOf(none, blog!, true)).toMatchObject({ user: '', label: 'Linux user not set' })
    const unlisted = overviewSource({ principals: [principal('x', [])] })
    expect(runsAsOf(unlisted, blog!, true).user).toBe('')
    const gone = { id: 'ghost', name: 'ghost', kind: 'node' as const }
    expect(runsAsOf(source, gone, true).label).toBe('Linux user not set')
  })

  it('does not look for a user when the service has no saved row', () => {
    const view = configView({
      effective: { ...configView().effective, services: [viewService('new', 'node', [], { serviceId: null })] },
    })
    const fresh = overviewSource({ view })
    expect(runsAsOf(fresh, { id: 'new', name: 'new', kind: 'node' }, true).user).toBe('')
  })

  it('reads the Base side for the Base map and says "own" for an environment that stands alone', () => {
    expect(runsAsOf(source, web!, false)).toMatchObject({ user: 'website', source: 'base' })
    const alone = overviewSource({ view: configView({ followsBase: false }) })
    expect(runsAsOf(alone, web!, true)).toMatchObject({ source: 'own', sourceLabel: 'Set in Staging' })
  })

  it('uses the Base row for an app only the Base has', () => {
    const view = configView({
      effective: { ...configView().effective, services: [] },
      base: { ...configView().base, services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')])] },
    })
    expect(runsAsOf(overviewSource({ view }), { id: 'web', name: 'web', kind: 'node' }, true).user).toBe('website')
  })
})

describe('mapInputOf', () => {
  const source = overviewSource()

  it('draws the environment: domains, volumes, databases and status', () => {
    const input = mapInputOf(source, 'env')
    expect(input.services.map((s) => s.id)).toEqual(['web', 'blog', 'api', 'redis', 'db:shopdb', 'db:ghostdb'])
    expect(input.domains).toHaveLength(1)
    expect(input.volumes).toHaveLength(2)
    expect(input.status(input.services[0]!)).toEqual({ key: 'running', label: 'Running' })
    expect(input.status(input.services[4]!)).toBeNull()
    const layout = mapLayout(input)
    expect(layout.counts).toEqual({ domains: 1, apps: 3, data: 5 })
    const webNode = layout.nodes.find((n) => n.name === 'web')
    expect(webNode?.tags).toEqual(['Staging change'])
    expect(webNode?.aria).toContain('running')
    expect(layout.nodes.find((n) => n.name === 'uploads')?.sub).toBe('web:/app/uploads')
  })

  it('draws the Base alone: no domains, volumes, databases or status', () => {
    const input = mapInputOf(source, 'base')
    expect(input.services.map((s) => s.id)).toEqual(['web', 'old'])
    expect(input.domains).toEqual([])
    expect(input.volumes).toEqual([])
    expect(mapLayout(input).nodes.every((n) => n.status === null)).toBe(true)
  })

  it('draws the Differences view with the app the environment removes', () => {
    const input = mapInputOf(source, 'diff')
    expect(input.services.map((s) => s.id)).toContain('old')
    expect(input.status(input.services.find((s) => s.id === 'old')!)).toBeNull()
    const layout = mapLayout(input)
    expect(layout.nodes.find((n) => n.name === 'old')).toMatchObject({ removed: true, tags: ['Removed in Staging'] })
    expect(layout.nodes.find((n) => n.name === 'web')?.tags[0]).toBe('Changed: start command')
  })

  it('shows no status before the containers load', () => {
    const input = mapInputOf(overviewSource({ containers: undefined }), 'env')
    expect(input.status(input.services[0]!)).toBeNull()
  })
})

describe('the lists under the map', () => {
  const source = overviewSource()

  it('lists apps with who they run as, status and where each comes from', () => {
    const rows = appRows(source)
    expect(rows.map((r) => r.name)).toEqual(['web', 'blog', 'api'])
    expect(rows[0]).toMatchObject({
      sub: 'Node.js app',
      recordId: 's-web',
      statusKey: 'running',
      source: 'env',
      sourceLabel: 'Staging change',
      host: 'shop.example.com',
    })
    expect(rows[1]).toMatchObject({ sub: 'Website', source: 'base', sourceLabel: 'Base', host: null })
    expect(rows[2]).toMatchObject({ sub: 'Container · ghcr.io/acme/api:1', statusKey: 'never' })
    expect(rows[2]?.runsAs.runsInContainer).toBe(true)
  })

  it('carries the daemon report on an app row, and null until there is one', () => {
    const runState = { state: 'crashing', running: false, restartCount: 4, lastError: 'boom', asOf: '2026-10-05T12:00:00Z' } as const
    const services = ['web', 'blog', 'api', 'redis'].map((name) =>
      name === 'web' ? { ...serviceRecord(name), runState } : serviceRecord(name),
    )
    const rows = appRows(overviewSource({ services }))
    expect(rows[0]).toMatchObject({ statusKey: 'crashing', runState })
    expect(rows[1]?.runState).toBeNull()
  })

  it('calls every app "Set in" when the environment stands alone, and an added app a change', () => {
    const alone = appRows(overviewSource({ view: configView({ followsBase: false }) }))
    expect(alone.every((r) => r.source === 'own')).toBe(true)
    const view = configView({
      changes: [],
      effective: {
        ...configView().effective,
        services: [viewService('extra', 'node', [], { source: 'environment' })],
      },
    })
    expect(appRows(overviewSource({ view }))[0]?.source).toBe('env')
  })

  it('lists data containers, databases and storage', () => {
    const rows = dataRows(source)
    expect(rows.map((r) => [r.kind, r.name, r.sub])).toEqual([
      ['store', 'redis', 'redis:8'],
      ['database', 'shopdb', 'PostgreSQL'],
      ['database', 'ghostdb', 'weird'],
      ['volume', 'uploads', 'web:/app/uploads'],
      ['volume', 'empty', 'Storage'],
    ])
    expect(rows[0]).toMatchObject({ statusKey: 'stopped', recordId: 's-redis' })
    expect(rows[1]).toMatchObject({ statusKey: null, recordId: undefined })
    expect(rows[3]?.recordId).toBe('st-uploads')
    const bare = dataRows(overviewSource({ bindings: [{ ...source.bindings[0]!, engine: null }] }))
    expect(bare.find((r) => r.kind === 'database')?.sub).toBe('Database we run and back up for you')
  })

  it('names a data container by its kind when it has no image row', () => {
    const view = configView({
      effective: { ...configView().effective, services: [viewService('redis', 'container', [row('redis', 'image', 'redis:8')])] },
    })
    expect(dataRows(overviewSource({ view }))[0]?.sub).toBe('redis:8')
  })
})

describe('relationCard', () => {
  const view = configView()
  it('counts the changes of an environment that follows the Base', () => {
    expect(relationCard(view, 'Staging', 2)).toEqual({
      kind: 'changes',
      title: 'Changes from Base (4)',
      text: 'Follows the Base · 4 changes',
      count: 4,
    })
  })
  it('has no card, and never a 0, when there is nothing to say', () => {
    expect(relationCard(configView({ changes: [] }), 'Staging', 2)).toEqual({ kind: 'none' })
  })
  it('says an environment stands alone when the project has several', () => {
    expect(relationCard(configView({ followsBase: false }), 'Staging', 2)).toEqual({
      kind: 'alone',
      title: 'Staging stands alone',
      text: 'Changes to the Base do not reach it.',
    })
    expect(relationCard(configView({ followsBase: false }), 'Staging', 1)).toEqual({ kind: 'none' })
  })
})
