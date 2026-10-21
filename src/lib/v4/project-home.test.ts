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
  deployProgressLabel,
  EMPTY_SIDE,
  environmentCardData,
  environmentDomains,
  environmentRelation,
  hasNativeApp,
  inFlightDeployEntries,
  inProgressSub,
  isDeployInProgress,
  lastDeployPart,
  miniMapColumns,
  nativeDeployKey,
  newEnvironmentBody,
  reachNames,
  runningStatusKey,
  serverLine,
  serviceStatusKey,
  startPreview,
  startChoices,
  v4ServiceOf,
  visitHost,
} from './project-home'

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

function row(
  field: string,
  value: string | null,
  area: ConfigViewFieldRow['area'] = 'service'
): ConfigViewFieldRow {
  return {
    key: `svc:web:${field}`,
    area,
    field,
    label: field,
    value,
    masked: value === null,
    source: 'base',
    inheritedFromBase: true,
  }
}

function service(
  name: string,
  kind: ConfigViewService['kind'],
  rows: ConfigViewFieldRow[] = []
): ConfigViewService {
  return { name, serviceId: null, kind, source: 'base', inheritedFromBase: true, rows }
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
    {
      name: 'website',
      access: 'sftp',
      description: null,
      source: 'base',
      inheritedFromBase: true,
      usedBy: ['web'],
    },
    {
      name: 'jobs',
      access: 'none',
      description: null,
      source: 'base',
      inheritedFromBase: true,
      usedBy: [],
    },
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
      ])
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

describe('native apps (no container rows)', () => {
  it('spots a native app in the config', () => {
    expect(hasNativeApp(SIDE.services)).toBe(true)
    expect(hasNativeApp([service('cache', 'container')])).toBe(false)
    expect(hasNativeApp(undefined)).toBe(false)
  })
  it('reads the newest deploy', () => {
    expect(nativeDeployKey(undefined)).toBeUndefined()
    expect(nativeDeployKey(null)).toBe('never')
    expect(nativeDeployKey(group({ status: 'succeeded' }))).toBe('deployed')
    expect(nativeDeployKey(group({ status: 'failed' }))).toBe('failed')
    expect(nativeDeployKey(group({ status: 'running' }))).toBe('deploying')
  })
  it('shows a succeeded deploy as deployed, not never deployed', () => {
    expect(runningStatusKey([], { latest: group({ status: 'succeeded' }) })).toBe('deployed')
    expect(runningStatusKey([], { latest: group({ status: 'failed' }) })).toBe('failed')
    expect(runningStatusKey([], { latest: null })).toBe('never')
    expect(runningStatusKey([], { latest: undefined })).toBeUndefined()
    expect(runningStatusKey([])).toBe('never')
  })
  it('lets real containers win over the deploy', () => {
    expect(
      runningStatusKey([container({ status: 'running' })], { latest: group({ status: 'failed' }) })
    ).toBe('running')
  })
  it('gives an app on the map the deploy state, or nothing before a deploy', () => {
    expect(serviceStatusKey([], { latest: group({ status: 'succeeded' }) })).toBe('deployed')
    expect(serviceStatusKey([], { latest: null })).toBeNull()
    expect(serviceStatusKey([], { latest: undefined })).toBeNull()
  })
  it('puts it on the card: native apps deployed, container apps untouched', () => {
    const native: EnvironmentConfigViewResponse = {
      ok: true,
      environmentId: 'e',
      projectId: 'p',
      isPrimary: false,
      standsAlone: false,
      base: SIDE,
      effective: SIDE,
      changes: [],
    }
    const data = environmentCardData({
      name: 'Live',
      containers: [],
      view: native,
      latest: group({}),
      serverLine: 'x',
      now: NOW,
    })
    expect(data.running).toEqual({ status: 'deployed' })
    const apps = data.columns?.find((column) => column.key === 'apps')
    expect(apps?.items[0]?.status).toBe('deployed')
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
    const pushed = group({
      trigger: { kind: 'push', branch: 'main', commitSha: 'a41c9e2ffff', sourceId: null },
    })
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
    expect(lastDeployPart(group({ strategyOutcome: 'rolled_back' }), NOW)?.status).toBe(
      'rolledback'
    )
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
        NOW
      )
    ).toBe('Started 4m ago · push to main')
    expect(inProgressSub(group({ startedAt: null }), NOW)).toBe('Starting now')
  })
})

describe('relation to the Base', () => {
  it('shows nothing before the answer is known', () => {
    expect(environmentRelation(undefined)).toBeNull()
  })

  it('stands alone', () => {
    expect(environmentRelation({ standsAlone: true, changes: [{}, {}] })).toEqual({
      standsAlone: true,
      changeCount: 0,
      text: 'Stands alone',
      source: 'own',
    })
  })

  it('with no changes: plain words, no "0 changes"', () => {
    expect(environmentRelation({ standsAlone: false, changes: [] })).toEqual({
      standsAlone: false,
      changeCount: 0,
      text: 'Same as the Base',
      source: 'base',
    })
  })

  it('counts the changes', () => {
    expect(environmentRelation({ standsAlone: false, changes: [{}] })).toMatchObject({
      text: '1 change from the Base',
      source: 'env',
    })
    expect(environmentRelation({ standsAlone: false, changes: [{}, {}] })?.text).toBe(
      '2 changes from the Base'
    )
  })

  it('summarises the Base', () => {
    expect(baseCounts(SIDE)).toBe('4 services · 2 Hosting Accounts')
    expect(baseCounts(EMPTY_SIDE)).toBe('0 services · 0 Hosting Accounts')
    expect(baseLine(SIDE)).toBe('Base · 4 services · 2 Hosting Accounts')
  })

  it('says which environments use it and which stand alone', () => {
    expect(
      reachNames([
        { name: 'Production', standsAlone: false },
        { name: 'Staging', standsAlone: false },
        { name: 'Preview', standsAlone: true },
        { name: 'Unknown', standsAlone: null },
      ])
    ).toBe('Production and Staging use it · Preview stands alone')
    expect(reachNames([{ name: 'Production', standsAlone: false }])).toBe('Production uses it')
    expect(
      reachNames([
        { name: 'A', standsAlone: true },
        { name: 'B', standsAlone: true },
      ])
    ).toBe('A and B stand alone')
    expect(reachNames([])).toBe('')
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
    expect(baseRunsAs({ ...SIDE, services: [SIDE.services[2] as ConfigViewService] }, 'x')).toEqual(
      []
    )
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
    const [visitors, apps, data] = miniMapColumns(
      SIDE,
      [{ serviceName: 'web' }, { serviceName: null }],
      statusOf
    )
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
      ['visitors', 'No hostnames yet', 0],
      ['apps', 'No apps yet', 0],
      ['data', 'None', 0],
    ])
  })
})

describe('new environment', () => {
  it('always names how it starts', () => {
    expect(
      newEnvironmentBody({ projectId: 'p', name: '  staging ', start: 'copy', serverId: null })
    ).toEqual({ projectId: 'p', name: 'staging', start: 'copy' })
    expect(
      newEnvironmentBody({ projectId: 'p', name: 'preview', start: 'empty', serverId: null })
    ).toEqual({ projectId: 'p', name: 'preview', start: 'empty' })
  })

  it('pins a server only when one was chosen', () => {
    expect(
      newEnvironmentBody({ projectId: 'p', name: 'staging', start: 'copy', serverId: 'srv-1' })
    ).toEqual({ projectId: 'p', name: 'staging', start: 'copy', serverId: 'srv-1' })
  })

  it('previews what the environment will run', () => {
    expect(startPreview('copy', null)).toBeNull()
    const copied = startPreview('copy', SIDE)
    expect(
      copied?.find((column) => column.key === 'apps')?.items.map((item) => item.status)
    ).toEqual([null, null, null])
    const alone = startPreview('empty', SIDE)
    expect(alone?.every((column) => column.items.length === 0)).toBe(true)
  })

  it('offers the copy of the primary environment first, then empty', () => {
    const choices = startChoices('production')
    expect(choices.map((choice) => choice.key)).toEqual(['copy', 'empty'])
    expect(choices[0]?.title).toBe('Copy of production')
    expect(choices[0]?.body).toContain('still uses the Base')
    expect(choices[1]?.title).toBe('Empty, stands alone')
    expect(startChoices(null)[0]?.title).toBe('Copy of the primary environment')
  })

  it('never uses the old wording', () => {
    const text = JSON.stringify([startChoices('production'), startChoices(null)])
    expect(text).not.toMatch(/start from the base|follows? the base/i)
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
    isPrimary: false,
    standsAlone: false,
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
    expect(data.badge).toBeNull()
    expect(data.relation?.text).toBe('1 change from the Base')
    expect(data.running).toEqual({ status: 'running' })
    expect(data.lastDeploy).toEqual({ status: 'deployed', sub: '4m ago' })
    expect(data.branch).toBe('main')
    expect(data.visitHost).toBe('example.com')
    expect(data.serverLine).toBe('Frankfurt 1')
    const apps = data.columns?.find((column) => column.key === 'apps')
    expect(apps?.items[0]).toEqual({ name: 'web', status: 'running', changed: true })
    expect(apps?.items[1]).toEqual({ name: 'worker', status: 'deployed', changed: false })
  })

  it('badges the primary and the pinned environment', () => {
    const card = (flags: { isPrimary?: boolean; pinned?: boolean } | undefined) =>
      environmentCardData({
        name: 'Production',
        containers: [],
        view,
        latest: group({}),
        serverLine: '',
        now: NOW,
        flags,
      }).badge
    expect(card({ isPrimary: true })).toBe('Primary')
    expect(card({ pinned: true })).toBe('Pinned')
    expect(card({})).toBeNull()
    expect(card(undefined)).toBeNull()
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

describe('deploy progress on a card', () => {
  const hostCommand = (id: string, status: DeploymentGroup['status']) =>
    ({
      id,
      commandId: id,
      serverId: `srv-${id}`,
      status,
    }) as unknown as DeploymentGroup['commands'][number]
  const progress = {
    version: 1 as const,
    current: 'build',
    updatedAt: '2026-10-05T12:00:00Z',
    steps: [
      { id: 'fetch', label: 'Fetch the code', state: 'done' as const },
      { id: 'build', label: 'Build', state: 'running' as const },
      { id: 'start', label: 'Start the app', state: 'pending' as const },
    ],
  }

  it('polls only the commands of deploys still going', () => {
    const latest = {
      a: group({
        status: 'running',
        commands: [hostCommand('c1', 'running'), hostCommand('c2', 'succeeded')],
      }),
      b: group({ status: 'succeeded', commands: [hostCommand('c3', 'succeeded')] }),
      c: null,
      d: undefined,
    }
    expect(inFlightDeployEntries(latest)).toEqual([{ serverId: 'srv-c1', commandId: 'c1' }])
  })

  it('copes with a deploy row that has no host commands', () => {
    const bare = group({
      status: 'running',
      commands: undefined as unknown as DeploymentGroup['commands'],
    })
    expect(inFlightDeployEntries({ a: bare })).toEqual([])
    expect(deployProgressLabel(bare, new Map())).toBeNull()
  })

  it('reads the step of the first host that reports one', () => {
    const running = group({
      status: 'running',
      commands: [hostCommand('c0', 'running'), hostCommand('c1', 'running')],
    })
    const records = new Map([
      ['c0', { progress: null }],
      ['c1', { progress }],
    ])
    expect(deployProgressLabel(running, records)).toBe('Step 2 of 3 · Building')
    expect(deployProgressLabel(running, new Map())).toBeNull()
    expect(deployProgressLabel(group({ status: 'succeeded' }), records)).toBeNull()
    expect(deployProgressLabel(null, records)).toBeNull()
  })

  it('puts the step on the last-deploy part only while the deploy runs', () => {
    expect(
      lastDeployPart(group({ status: 'running' }), NOW, 'Step 2 of 3 · Building')
    ).toMatchObject({
      status: 'deploying',
      label: 'Step 2 of 3 · Building',
    })
    expect(
      lastDeployPart(group({ status: 'succeeded' }), NOW, 'Step 2 of 3 · Building')?.label
    ).toBeUndefined()
    expect(lastDeployPart(group({ status: 'running' }), NOW, null)).toMatchObject({
      status: 'deploying',
    })
  })
})
