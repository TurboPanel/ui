import { describe, expect, it } from 'vitest'
import type { DeploymentGroup } from '@/lib/deployment-history'
import type {
  ConfigViewSide,
  ContainerRecord,
  EnvironmentConfigViewResponse,
  EnvironmentRecord,
  ProjectRecord,
} from '@/lib/instance-api'
import {
  deploysInProgress,
  emptyTypeMessage,
  filterProjectsByType,
  homeKind,
  homeProject,
  managedEngineText,
  parseProjectTypeFilter,
  pillTone,
  projectDetail,
  projectTypeCounts,
  projectTypeOf,
  projectTypeOptions,
  summaryLine,
  tilePills,
  wantsConfigView,
} from './projects-home'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function project(partial: Partial<ProjectRecord>): ProjectRecord {
  return {
    id: 'p1',
    name: 'Shop',
    description: null,
    workspaceId: 'w',
    repositoryId: null,
    kind: 'compose',
    ...partial,
  } as ProjectRecord
}

function env(id: string, name: string | null, projectId = 'p1'): EnvironmentRecord {
  return {
    id,
    name,
    description: null,
    projectId,
    serverId: null,
    metadata: null,
    options: null,
    createdAt: '',
    updatedAt: '',
  }
}

function container(environmentId: string, status: string): ContainerRecord {
  return {
    id: `c-${environmentId}`,
    serviceId: 's',
    environmentId,
    serverId: 'srv',
    containerId: 'abc',
    containerName: 'n',
    status,
    role: 'service',
    composeServiceName: 'web',
    createdAt: '',
    updatedAt: '',
  }
}

const BASE: ConfigViewSide = {
  services: [
    {
      name: 'web',
      serviceId: null,
      kind: 'node',
      source: 'base',
      inheritedFromBase: true,
      rows: [
        {
          key: 'svc:web:linuxUser',
          area: 'linuxUser',
          field: 'linuxUser',
          label: 'Linux user',
          value: 'shop',
          masked: false,
          source: 'base',
          inheritedFromBase: true,
        },
        {
          key: 'svc:web:domain:shop.example.com',
          area: 'domain',
          field: 'domain:shop.example.com',
          label: 'Domain',
          value: 'shop.example.com',
          masked: false,
          source: 'base',
          inheritedFromBase: true,
        },
      ],
    },
  ],
  variables: [],
  linuxUsers: [
    {
      name: 'shop',
      access: 'sftp',
      description: null,
      source: 'base',
      inheritedFromBase: true,
      usedBy: ['web'],
    },
  ],
}

function view(usesBase: boolean, changes = 0): EnvironmentConfigViewResponse {
  return {
    ok: true,
    environmentId: 'e',
    projectId: 'p1',
    standsAlone: !usesBase,
    isPrimary: false,
    base: BASE,
    effective: BASE,
    changes: Array.from({ length: changes }, (_, index) => ({
      key: `svc:web:c${index}`,
      area: 'service' as const,
      label: 'x',
      field: 'c',
      serviceName: 'web',
      serviceId: null,
      kind: 'changed' as const,
      baseValue: 'a',
      baseSource: 'base' as const,
      envValue: 'b',
      envSource: 'environment' as const,
      masked: false,
    })),
  }
}

describe('what kind of project it is', () => {
  it('tells the four apart', () => {
    expect(homeKind(project({ kind: 'system' }))).toBe('platform')
    expect(homeKind(project({ kind: 'managed' }))).toBe('managed')
    expect(homeKind(project({ kind: null }))).toBe('setup')
    expect(homeKind(project({ kind: 'compose' }))).toBe('compose')
    expect(homeKind(project({ kind: 'compose', metadata: { code: 'wordpress' } }))).toBe('compose')
  })

  it('reads the newest deploy of Compose projects only', () => {
    expect(wantsConfigView(project({}))).toBe(true)
    expect(wantsConfigView(project({ kind: 'managed' }))).toBe(false)
  })
})

describe('a project tile', () => {
  const production = { ...env('e1', 'Production'), isPrimary: true, createdAt: '2026-01-01' }
  const staging = { ...env('e2', 'Staging'), pinned: true, createdAt: '2026-01-02' }
  const preview = { ...env('e3', 'Preview'), createdAt: '2026-01-03' }

  it('lists the primary first, then the pinned ones, whatever order they arrive in', () => {
    const card = homeProject({
      project: project({}),
      environments: [preview, staging, production],
      containersByEnvironment: { e1: [container('e1', 'running')], e2: [], e3: [] },
    })
    expect(card.environments).toEqual([
      { id: 'e1', name: 'Production', status: 'running', isPrimary: true, pinned: false },
      { id: 'e2', name: 'Staging', status: 'never', isPrimary: false, pinned: true },
      { id: 'e3', name: 'Preview', status: 'never', isPrimary: false, pinned: false },
    ])
    expect(card.status).toBe('never')
    expect(card.workspaceId).toBe('w')
  })

  it('orders pinned environments by when they were created', () => {
    const later = { ...env('e4', 'Later'), pinned: true, createdAt: '2026-02-01' }
    const card = homeProject({
      project: project({}),
      environments: [later, staging, production],
      containersByEnvironment: {},
    })
    expect(card.environments.map((e) => e.id)).toEqual(['e1', 'e2', 'e4'])
  })

  it('takes the oldest environment as primary when none is marked', () => {
    const card = homeProject({
      project: project({}),
      environments: [preview, { ...env('e0', 'First'), createdAt: '2025-12-01' }],
      containersByEnvironment: {},
    })
    expect(card.environments.map((e) => [e.id, e.isPrimary])).toEqual([
      ['e0', true],
      ['e3', false],
    ])
  })

  it('leaves out what has not been read yet', () => {
    const card = homeProject({
      project: project({ name: null }),
      environments: [env('e1', null)],
      containersByEnvironment: undefined,
    })
    expect(card.name).toBe('Unnamed project')
    expect(card.environments[0]).toMatchObject({ name: 'Environment', status: 'unknown' })
    expect(card.status).toBe('unknown')
  })

  it('treats an environment with no container list entry as not deployed', () => {
    const card = homeProject({
      project: project({}),
      environments: [production],
      containersByEnvironment: {},
    })
    expect(card.environments[0]?.status).toBe('never')
  })

  it('tells a deployed native app by its newest deploy when there are no containers', () => {
    const deployed = { status: 'succeeded' } as DeploymentGroup
    const input = {
      project: project({}),
      environments: [production],
      containersByEnvironment: {},
      latest: { e1: deployed },
    }
    expect(homeProject(input).environments[0]?.status).toBe('deployed')
    expect(homeProject({ ...input, latest: { e1: undefined } }).environments[0]?.status).toBe(
      'unknown'
    )
    // Config views, when a caller read them, say which environments run a native app.
    expect(homeProject({ ...input, views: { e1: view(true) } }).environments[0]?.status).toBe(
      'deployed'
    )
    expect(homeProject({ ...input, views: {} }).environments[0]?.status).toBe('never')
  })

  it('does not read deploys for a managed project', () => {
    const card = homeProject({
      project: project({ kind: 'managed' }),
      environments: [production],
      containersByEnvironment: {},
      latest: { e1: { status: 'succeeded' } as DeploymentGroup },
    })
    expect(card.kind).toBe('managed')
    expect(card.environments[0]?.status).toBe('never')
  })

  it('gives a platform project no environments, only its status', () => {
    const card = homeProject({
      project: project({ kind: 'system' }),
      environments: [env('e1', 'HTTP Ingress'), env('e2', 'HTTP Ingress')],
      containersByEnvironment: {
        e1: [container('e1', 'running')],
        e2: [container('e2', 'exited')],
      },
    })
    expect(card.environments).toEqual([])
    expect(card.status).toBe('stopped')
  })
})

describe('what a tile shows of the environments', () => {
  const row = (id: string, isPrimary: boolean, pinned: boolean) => ({
    id,
    name: id,
    status: 'running',
    isPrimary,
    pinned,
  })

  it('names the primary and the pinned ones and folds the rest into a count', () => {
    const shown = tilePills({
      environments: [
        row('a', true, false),
        row('b', false, true),
        row('c', false, false),
        row('d', false, false),
      ],
    })
    expect(shown.shown.map((e) => e.id)).toEqual(['a', 'b'])
    expect(shown.more).toBe(2)
  })

  it('has no count when everything is shown or nothing exists', () => {
    expect(tilePills({ environments: [row('a', true, false)] }).more).toBe(0)
    expect(tilePills({ environments: [] })).toEqual({ shown: [], more: 0 })
  })
})

describe('the colour of a status dot', () => {
  it('maps the status words to four tones, with failures in the warning tone', () => {
    expect(pillTone('running')).toBe('ok')
    expect(pillTone('deployed')).toBe('ok')
    expect(pillTone('deploying')).toBe('busy')
    expect(pillTone('busy')).toBe('busy')
    expect(pillTone('queued')).toBe('busy')
    expect(pillTone('failed')).toBe('warn')
    expect(pillTone('crashing')).toBe('warn')
    expect(pillTone('unhealthy')).toBe('warn')
    expect(pillTone('stopped')).toBe('idle')
    expect(pillTone('never')).toBe('idle')
    expect(pillTone('nonsense')).toBe('idle')
  })
})

describe('summary line', () => {
  it('counts what is there and waits for the running count', () => {
    expect(summaryLine(4, 9, 7)).toBe('4 projects · 9 environments · 7 running')
    expect(summaryLine(1, 1, null)).toBe('1 project · 1 environment')
  })
})

describe('deploys in progress', () => {
  function group(partial: Partial<DeploymentGroup>): DeploymentGroup {
    return {
      id: 'g',
      generation: 1,
      commands: [],
      status: 'running',
      actorEntityType: 'user',
      trigger: null,
      strategy: null,
      strategyOutcome: null,
      startedAt: '2026-10-05T11:58:00Z',
      durationMs: null,
      cancelRequestedAt: null,
      ...partial,
    }
  }

  it('lists only unfinished deploys, newest first, with project and environment', () => {
    const rows = deploysInProgress({
      projects: [
        { id: 'p1', name: 'Shop' },
        { id: 'p2', name: null },
      ],
      environments: [
        env('e1', 'Production'),
        env('e2', 'Staging', 'p2'),
        env('e3', 'Preview'),
        env('e4', 'Lost', 'gone'),
        env('e5', 'Idle'),
      ],
      latest: {
        e1: group({ startedAt: '2026-10-05T11:50:00Z' }),
        e2: group({ status: 'queued', startedAt: null }),
        e3: group({ status: 'succeeded' }),
        e4: group({}),
        e5: null,
      },
      now: NOW,
    })
    expect(rows).toEqual([
      {
        environmentId: 'e2',
        projectId: 'p2',
        title: 'Unnamed project · Staging',
        sub: 'Starting now',
        status: 'queued',
        startedAt: NOW,
      },
      {
        environmentId: 'e1',
        projectId: 'p1',
        title: 'Shop · Production',
        sub: 'Started 10m ago',
        status: 'deploying',
        startedAt: Date.parse('2026-10-05T11:50:00Z'),
      },
    ])
  })

  it('is empty when nothing is running', () => {
    expect(deploysInProgress({ projects: [], environments: [], latest: {}, now: NOW })).toEqual([])
  })
})

describe('what the second line says a project is', () => {
  const pg18 = {
    engineDisplayName: 'PostgreSQL',
    options: { settings: { image: 'docker.io/library/postgres:18-alpine' } },
  }

  it('names a managed database with its engine and the version its clusters run', () => {
    const p = project({ kind: 'managed', metadata: { code: 'postgres' } })
    expect(projectDetail(p, 'managed', { managedRows: [pg18] })).toBe(
      'Managed database · PostgreSQL 18'
    )
    expect(
      homeProject({
        project: p,
        environments: [],
        containersByEnvironment: {},
        facts: { managedRows: [pg18] },
      }).detail
    ).toBe('Managed database · PostgreSQL 18')
  })

  it('leaves the version out when it is not stored or the clusters differ', () => {
    const p = project({ kind: 'managed', metadata: { code: 'postgres' } })
    const unstated = { engineDisplayName: 'PostgreSQL', options: null }
    const pg17 = {
      engineDisplayName: 'PostgreSQL',
      options: { settings: { image: 'docker.io/library/postgres:17' } },
    }
    expect(managedEngineText(p, [unstated])).toBe('PostgreSQL')
    expect(managedEngineText(p, [pg18, pg17])).toBe('PostgreSQL')
    expect(managedEngineText(p, [pg18, unstated])).toBe('PostgreSQL')
    expect(
      managedEngineText(p, [
        { engineDisplayName: null, options: { settings: { image: 'not/in-catalog:1' } } },
      ])
    ).toBe('PostgreSQL')
  })

  it('names the engine from the catalog code for a database not set up yet, and nothing when unknown', () => {
    expect(
      projectDetail(project({ kind: 'managed', metadata: { code: 'mariadb' } }), 'managed')
    ).toBe('Managed database · MariaDB')
    expect(projectDetail(project({ kind: 'managed', metadata: null }), 'managed')).toBe(
      'Managed database'
    )
    expect(projectDetail(project({ kind: 'managed', metadata: { code: 'nope' } }), 'managed')).toBe(
      'Managed database'
    )
  })

  it('says Git repository with owner/repo when the repository list names it', () => {
    const p = project({ repositoryId: 'r1' })
    expect(projectDetail(p, 'compose', { repositoryLabel: 'TurboPanel/website' })).toBe(
      'Git repository · TurboPanel/website'
    )
    expect(projectDetail(p, 'compose')).toBe('Git repository')
  })

  it('says Compose (a project made from the catalog too), and nothing for platform or not set up', () => {
    expect(projectDetail(project({}), 'compose')).toBe('Compose')
    expect(projectDetail(project({ metadata: { code: 'wordpress' } }), 'compose')).toBe('Compose')
    expect(projectDetail(project({ kind: 'system' }), 'platform')).toBeNull()
    expect(projectDetail(project({ kind: null }), 'setup')).toBeNull()
  })
})

describe('the type filter', () => {
  const cards = [
    { id: 'a', kind: 'compose' as const },
    { id: 'b', kind: 'managed' as const },
    { id: 'c', kind: 'setup' as const },
    { id: 'd', kind: 'platform' as const },
    { id: 'e', kind: 'managed' as const },
  ]

  it('reads ?type= and treats anything else as All', () => {
    expect(parseProjectTypeFilter('managed')).toBe('managed')
    expect(parseProjectTypeFilter(['apps', 'managed'])).toBe('apps')
    expect(parseProjectTypeFilter('all')).toBe('all')
    expect(parseProjectTypeFilter('compose')).toBe('all')
    expect(parseProjectTypeFilter(undefined)).toBe('all')
  })

  it('puts managed databases on one side and every other project on the other', () => {
    expect(projectTypeOf('managed')).toBe('managed')
    expect(projectTypeOf('compose')).toBe('apps')
    expect(projectTypeOf('setup')).toBe('apps')
    expect(projectTypeOf('platform')).toBe('apps')
  })

  it('counts each side and filters to it', () => {
    expect(projectTypeCounts(cards)).toEqual({ all: 5, apps: 3, managed: 2 })
    expect(projectTypeCounts([])).toEqual({ all: 0, apps: 0, managed: 0 })
    expect(filterProjectsByType(cards, 'all').map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(filterProjectsByType(cards, 'apps').map((c) => c.id)).toEqual(['a', 'c', 'd'])
    expect(filterProjectsByType(cards, 'managed').map((c) => c.id)).toEqual(['b', 'e'])
  })

  it('labels each choice with its count', () => {
    expect(projectTypeOptions({ all: 3, apps: 2, managed: 1 })).toEqual([
      { value: 'all', label: 'All 3', accessibilityLabel: 'All, 3 projects' },
      { value: 'apps', label: 'Apps 2', accessibilityLabel: 'Apps, 2 projects' },
      {
        value: 'managed',
        label: 'Managed databases 1',
        accessibilityLabel: 'Managed databases, 1 project',
      },
    ])
  })

  it('says what is missing when a filter leaves nothing', () => {
    expect(emptyTypeMessage('managed')).toBe('No managed databases here yet.')
    expect(emptyTypeMessage('apps')).toBe('No apps here yet.')
  })
})
