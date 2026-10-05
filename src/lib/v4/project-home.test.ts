import { describe, expect, it } from 'vitest'
import type { DeploymentGroup } from '@/lib/deployment-history'
import type {
  ConfigViewFieldRow,
  EnvironmentConfigViewResponse,
  ConfigViewService,
  ConfigViewSide,
  ContainerRecord,
} from '@/lib/instance-api'
import {
  baseCounts,
  baseLine,
  baseRunsAs,
  builtBranch,
  EMPTY_SIDE,
  environmentCardData,
  environmentDomains,
  environmentRelation,
  followLine,
  inProgressSub,
  isDeployInProgress,
  lastDeployPart,
  miniMapColumns,
  newEnvironmentBody,
  runningStatusKey,
  serverLine,
  serviceStatusKey,
  startPreview,
  START_CHOICES,
  v4ServiceOf,
  visitHost,
} from './project-home'
import { standAloneCompose } from './stand-alone-compose'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function container(partial: Partial<ContainerRecord>): ContainerRecord {
  return {
    id: 'c',
    serviceId: 's',
    environmentId: 'e',
    serverId: 'srv',
    containerId: 'abc',
    containerName: 'n',
    status: 'running',
    role: 'service',
    composeServiceName: 'web',
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

function row(field: string, value: string | null, area: ConfigViewFieldRow['area'] = 'service'): ConfigViewFieldRow {
  return {
    key: `svc:web:${field}`,
    area,
    field,
    label: field,
    value,
    masked: value === null,
    source: 'base',
  }
}

function service(
  name: string,
  kind: ConfigViewService['kind'],
  rows: ConfigViewFieldRow[] = [],
): ConfigViewService {
  return { name, serviceId: null, kind, source: 'base', rows }
}

const SIDE: ConfigViewSide = {
  services: [
    service('web', 'node', [
      row('linuxUser', 'website'),
      row('domain:example.com', 'example.com', 'domain'),
      row('domain:example.com/blog', 'example.com/blog', 'domain'),
      row('domain:*.example.com', '*.example.com', 'domain'),
      row('panel.source.branch', 'main'),
    ]),
    service('worker', 'node'),
    service('cache', 'container', [row('image', 'redis:7')]),
    service('proxy', 'container', [row('image', 'caddy:2')]),
  ],
  variables: [],
  linuxUsers: [
    { name: 'website', access: 'sftp', description: null, source: 'base', usedBy: ['web'] },
    { name: 'jobs', access: 'none', description: null, source: 'base', usedBy: [] },
  ],
}

function group(partial: Partial<DeploymentGroup>): DeploymentGroup {
  return {
    id: 'g',
    generation: 1,
    commands: [],
    status: 'succeeded',
    actorEntityType: 'user',
    trigger: null,
    strategy: null,
    strategyOutcome: null,
    startedAt: '2026-10-05T11:56:00Z',
    durationMs: 1000,
    cancelRequestedAt: null,
    ...partial,
  }
}

describe('running status', () => {
  it('is unknown to the caller while containers load', () => {
    expect(runningStatusKey(undefined)).toBeUndefined()
  })

  it('says not deployed yet without containers, or when none ever reached a host', () => {
    expect(runningStatusKey([])).toBe('never')
    expect(runningStatusKey([container({ containerId: '', status: 'pending' })])).toBe('never')
  })

  it('says running when any app container runs, ignoring the ingress', () => {
    expect(runningStatusKey([container({ status: 'running' })])).toBe('running')
    expect(
      runningStatusKey([
        container({ role: 'ingress', status: 'running' }),
        container({ status: 'exited' }),
      ]),
    ).toBe('stopped')
  })

  it('says starting while a container restarts, stopped when they all exited, else unknown', () => {
    expect(runningStatusKey([container({ status: 'restarting' })])).toBe('busy')
    expect(runningStatusKey([container({ status: 'dead' })])).toBe('stopped')
    expect(runningStatusKey([container({ status: 'weird' })])).toBe('unknown')
  })

  it('falls back to every container when none is a service container', () => {
    expect(runningStatusKey([container({ role: 'ingress', status: 'running' })])).toBe('running')
  })

  it('gives one app its own state, or none before the first deploy', () => {
    expect(serviceStatusKey([])).toBeNull()
    expect(serviceStatusKey([container({ containerId: '', status: 'pending' })])).toBeNull()
    expect(serviceStatusKey([container({ status: 'running' })])).toBe('running')
  })
})

describe('last deploy', () => {
  it('is left out while history loads and plain when there is none', () => {
    expect(lastDeployPart(undefined, NOW)).toBeUndefined()
    expect(lastDeployPart(null, NOW)).toEqual({ status: 'never', label: 'No deploys yet' })
  })

  it('names a good deploy with its age', () => {
    expect(lastDeployPart(group({}), NOW)).toEqual({ status: 'deployed', sub: '4m ago' })
  })

  it('adds the short commit of a push', () => {
    const pushed = group({ trigger: { kind: 'push', branch: 'main', commitSha: 'a41c9e2ffff', sourceId: null } })
    expect(lastDeployPart(pushed, NOW)?.sub).toBe('a41c9e2 · 4m ago')
  })

  it('has a word for each way a deploy ends', () => {
    expect(lastDeployPart(group({ status: 'failed' }), NOW)?.status).toBe('failed')
    expect(lastDeployPart(group({ status: 'timed_out' }), NOW)).toMatchObject({
      status: 'failed',
      label: 'Deploy timed out',
    })
    expect(lastDeployPart(group({ status: 'cancelled' }), NOW)?.status).toBe('cancelled')
    expect(lastDeployPart(group({ status: 'running' }), NOW)?.status).toBe('deploying')
    expect(lastDeployPart(group({ status: 'queued' }), NOW)?.status).toBe('queued')
    expect(lastDeployPart(group({ strategyOutcome: 'rolled_back' }), NOW)?.status).toBe('rolledback')
    expect(lastDeployPart(group({ strategyOutcome: 'needs_attention' }), NOW)).toMatchObject({
      status: 'failed',
      label: 'Needs attention',
    })
  })

  it('leaves the sub line out when nothing is known about the time', () => {
    expect(lastDeployPart(group({ startedAt: null }), NOW)).toEqual({ status: 'deployed' })
  })

  it('knows when a deploy is still going', () => {
    expect(isDeployInProgress(null)).toBe(false)
    expect(isDeployInProgress(undefined)).toBe(false)
    expect(isDeployInProgress(group({ status: 'succeeded' }))).toBe(false)
    expect(isDeployInProgress(group({ status: 'failed' }))).toBe(false)
    for (const status of ['queued', 'dispatching', 'sent', 'acked', 'running'] as const) {
      expect(isDeployInProgress(group({ status }))).toBe(true)
    }
  })

  it('says when a running deploy started and what pushed it', () => {
    expect(inProgressSub(group({}), NOW)).toBe('Started 4m ago')
    expect(
      inProgressSub(
        group({ trigger: { kind: 'push', branch: ' main ', commitSha: null, sourceId: null } }),
        NOW,
      ),
    ).toBe('Started 4m ago · push to main')
    expect(inProgressSub(group({ startedAt: null }), NOW)).toBe('Starting now')
  })
})

describe('relation to the Base', () => {
  it('shows nothing before the answer is known', () => {
    expect(environmentRelation(undefined)).toBeNull()
  })

  it('stands alone', () => {
    expect(environmentRelation({ followsBase: false, changes: [{}, {}] })).toEqual({
      standsAlone: true,
      changeCount: 0,
      text: 'Stands alone',
      source: 'own',
    })
  })

  it('follows the Base with no changes: plain words, no "0 changes"', () => {
    expect(environmentRelation({ followsBase: true, changes: [] })).toEqual({
      standsAlone: false,
      changeCount: 0,
      text: 'Follows the Base',
      source: 'base',
    })
  })

  it('counts the changes', () => {
    expect(environmentRelation({ followsBase: true, changes: [{}] })).toMatchObject({
      text: 'Follows the Base · 1 change',
      source: 'env',
    })
    expect(environmentRelation({ followsBase: true, changes: [{}, {}] })?.text).toBe(
      'Follows the Base · 2 changes',
    )
  })

  it('summarises the Base', () => {
    expect(baseCounts(SIDE)).toBe('4 services · 2 Linux users')
    expect(baseCounts(EMPTY_SIDE)).toBe('0 services · 0 Linux users')
    expect(baseLine(SIDE)).toBe('Base · 4 services · 2 Linux users')
  })

  it('says which environments follow it and which stand alone', () => {
    expect(
      followLine([
        { name: 'Production', followsBase: true },
        { name: 'Staging', followsBase: true },
        { name: 'Preview', followsBase: false },
        { name: 'Unknown', followsBase: null },
      ]),
    ).toBe('Production and Staging follow it · Preview stands alone')
    expect(followLine([{ name: 'Production', followsBase: true }])).toBe('Production follows it')
    expect(
      followLine([
        { name: 'A', followsBase: false },
        { name: 'B', followsBase: false },
      ]),
    ).toBe('A and B stand alone')
    expect(followLine([])).toBe('')
  })
})

describe('services, users and domains', () => {
  it('reads a service as the v4 helpers see it', () => {
    expect(v4ServiceOf(SIDE.services[2] as ConfigViewService)).toEqual({
      id: 'cache',
      name: 'cache',
      kind: 'container',
      image: 'redis:7',
    })
    expect(v4ServiceOf(SIDE.services[0] as ConfigViewService)).toEqual({
      id: 'web',
      name: 'web',
      kind: 'node',
    })
  })

  it('lists who runs the apps once each', () => {
    const chips = baseRunsAs(SIDE, 'My Shop')
    expect(chips.map((chip) => chip.label)).toEqual([
      'Runs as website',
      'Runs inside its container',
    ])
  })

  it('falls back to the first Linux user, else the project name', () => {
    const noDeclared: ConfigViewSide = { ...SIDE, services: [service('api', 'site')] }
    expect(baseRunsAs(noDeclared, 'My Shop')[0]?.label).toBe('Runs as website')
    const noUsers: ConfigViewSide = { ...noDeclared, linuxUsers: [] }
    expect(baseRunsAs(noUsers, 'My Shop')[0]?.label).toBe('Runs as my-shop')
  })

  it('has no chips for a Base of data stores only', () => {
    expect(baseRunsAs({ ...SIDE, services: [SIDE.services[2] as ConfigViewService] }, 'x')).toEqual([])
  })

  it('lists each domain once, host only', () => {
    expect(environmentDomains(SIDE)).toEqual(['example.com', '*.example.com'])
    expect(environmentDomains(EMPTY_SIDE)).toEqual([])
  })

  it('picks a domain to visit, never a wildcard', () => {
    expect(visitHost(SIDE)).toBe('example.com')
    const wildcardOnly: ConfigViewSide = {
      ...SIDE,
      services: [service('web', 'node', [row('domain:*.x.com', '*.x.com', 'domain')])],
    }
    expect(visitHost(wildcardOnly)).toBeNull()
  })

  it('finds the branch an app builds', () => {
    expect(builtBranch(SIDE)).toBe('main')
    expect(builtBranch(EMPTY_SIDE)).toBeNull()
    const blank: ConfigViewSide = {
      ...SIDE,
      services: [service('web', 'node', [row('panel.source.branch', '')])],
    }
    expect(builtBranch(blank)).toBeNull()
  })
})

describe('mini map', () => {
  const statusOf = (name: string) => (name === 'web' ? 'running' : null)

  it('draws visitors, apps and data from the real services', () => {
    const [visitors, apps, data] = miniMapColumns(SIDE, [{ serviceName: 'web' }, { serviceName: null }], statusOf)
    expect(visitors?.items.map((item) => item.name)).toEqual(['example.com', '*.example.com'])
    expect(apps?.items).toEqual([
      { name: 'web', status: 'running', changed: true },
      { name: 'worker', status: null, changed: false },
      { name: 'proxy', status: null, changed: false },
    ])
    expect(data?.items.map((item) => item.name)).toEqual(['cache'])
    expect([visitors?.label, apps?.label, data?.label]).toEqual(['Visitors', 'Apps', 'Data'])
  })

  it('says so when a column has nothing', () => {
    const columns = miniMapColumns(EMPTY_SIDE, [], statusOf)
    expect(columns.map((column) => [column.key, column.emptyText, column.items.length])).toEqual([
      ['visitors', 'No domains yet', 0],
      ['apps', 'No apps yet', 0],
      ['data', 'None', 0],
    ])
  })
})

describe('new environment', () => {
  it('starting from the Base sends no compose of its own', () => {
    expect(
      newEnvironmentBody({ projectId: 'p', name: '  Staging ', start: 'base', serverId: null }),
    ).toEqual({ projectId: 'p', name: 'Staging' })
  })

  it('standing alone sends services: !override {}', () => {
    const body = newEnvironmentBody({ projectId: 'p', name: 'Preview', start: 'empty', serverId: null })
    expect(body).toEqual({
      projectId: 'p',
      name: 'Preview',
      options: {
        compose: {
          version: 1,
          data: { services: { __turbopanelComposeTag: 'override', value: {} } },
          presentation: { keyOrder: ['services'], comments: {} },
        },
      },
    })
    expect(standAloneCompose().data.services).toEqual({ __turbopanelComposeTag: 'override', value: {} })
  })

  it('pins a server only when one was chosen', () => {
    expect(
      newEnvironmentBody({ projectId: 'p', name: 'Staging', start: 'base', serverId: 'srv-1' }),
    ).toEqual({ projectId: 'p', name: 'Staging', serverId: 'srv-1' })
  })

  it('previews what the environment will run', () => {
    expect(startPreview('base', null)).toBeNull()
    const fromBase = startPreview('base', SIDE)
    expect(fromBase?.find((column) => column.key === 'apps')?.items.map((item) => item.status)).toEqual([
      null,
      null,
      null,
    ])
    const alone = startPreview('empty', SIDE)
    expect(alone?.every((column) => column.items.length === 0)).toBe(true)
  })

  it('offers exactly the choices the API can honour', () => {
    expect(START_CHOICES.map((choice) => choice.key)).toEqual(['base', 'empty'])
  })
})

describe('server line', () => {
  const servers = [
    { id: 's1', name: 'Frankfurt 1', hostname: 'fra1' },
    { id: 's2', name: null, hostname: 'fra2.example.com' },
  ]

  it('names the environment own server', () => {
    expect(serverLine('s1', null, servers)).toBe('Frankfurt 1')
    expect(serverLine('s2', 's1', servers)).toBe('fra2.example.com')
  })

  it('does not invent a name for a server it cannot find', () => {
    expect(serverLine('gone', null, servers)).toBe('A server of this organization')
    expect(serverLine('s1', null, undefined)).toBe('A server of this organization')
  })

  it("falls back to the project's server, then to none", () => {
    expect(serverLine(null, 's1', servers)).toBe("Frankfurt 1 (the project's server)")
    expect(serverLine(null, 'gone', servers)).toBe("The project's server")
    expect(serverLine(null, null, servers)).toBe('No server yet')
  })
})

describe('environment card data', () => {
  const view: EnvironmentConfigViewResponse = {
    ok: true,
    environmentId: 'e',
    projectId: 'p',
    followsBase: true,
    base: SIDE,
    effective: SIDE,
    changes: [
      {
        key: 'svc:web:command',
        area: 'service',
        label: 'Start command',
        field: 'command',
        serviceName: 'web',
        serviceId: null,
        kind: 'changed',
        baseValue: 'a',
        baseSource: 'base',
        envValue: 'b',
        envSource: 'environment',
        masked: false,
      },
    ],
  }

  it('puts everything the card shows together', () => {
    const data = environmentCardData({
      name: 'Staging',
      containers: [container({ composeServiceName: 'web' })],
      view,
      latest: group({}),
      serverLine: 'Frankfurt 1',
      now: NOW,
    })
    expect(data.name).toBe('Staging')
    expect(data.relation?.text).toBe('Follows the Base · 1 change')
    expect(data.running).toEqual({ status: 'running' })
    expect(data.lastDeploy).toEqual({ status: 'deployed', sub: '4m ago' })
    expect(data.branch).toBe('main')
    expect(data.visitHost).toBe('example.com')
    expect(data.serverLine).toBe('Frankfurt 1')
    const apps = data.columns?.find((column) => column.key === 'apps')
    expect(apps?.items[0]).toEqual({ name: 'web', status: 'running', changed: true })
    expect(apps?.items[1]).toEqual({ name: 'worker', status: null, changed: false })
  })

  it('leaves out what is not known yet', () => {
    const data = environmentCardData({
      name: 'Staging',
      containers: undefined,
      view: undefined,
      latest: undefined,
      serverLine: 'No server yet',
      now: NOW,
    })
    expect(data.running).toEqual({ status: 'unknown', label: 'Checking…' })
    expect(data.lastDeploy).toBeUndefined()
    expect(data.relation).toBeNull()
    expect(data.columns).toBeNull()
    expect(data.branch).toBeNull()
    expect(data.visitHost).toBeNull()
  })
})
