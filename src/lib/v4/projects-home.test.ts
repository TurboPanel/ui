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
  homeKind,
  homeProject,
  pillTone,
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
    metadata: { type: 'docker-compose' },
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
    expect(homeKind(project({ metadata: { type: 'system' } }))).toBe('platform')
    expect(homeKind(project({ metadata: { type: 'managed' } }))).toBe('managed')
    expect(homeKind(project({ metadata: { type: 'empty' } }))).toBe('setup')
    expect(homeKind(project({ metadata: null }))).toBe('setup')
    expect(homeKind(project({ metadata: { type: 'docker-compose' } }))).toBe('compose')
    expect(homeKind(project({ metadata: { type: 'template' } }))).toBe('compose')
  })

  it('reads the newest deploy of Compose projects only', () => {
    expect(wantsConfigView(project({}))).toBe(true)
    expect(wantsConfigView(project({ metadata: { type: 'managed' } }))).toBe(false)
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
      project: project({ metadata: { type: 'managed' } }),
      environments: [production],
      containersByEnvironment: {},
      latest: { e1: { status: 'succeeded' } as DeploymentGroup },
    })
    expect(card.kind).toBe('managed')
    expect(card.environments[0]?.status).toBe('never')
  })

  it('gives a platform project no environments, only its status', () => {
    const card = homeProject({
      project: project({ metadata: { type: 'system' } }),
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
