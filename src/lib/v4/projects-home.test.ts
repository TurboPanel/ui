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
  summaryLine,
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
      rows: [
        { key: 'svc:web:linuxUser', area: 'linuxUser', field: 'linuxUser', label: 'Linux user', value: 'shop', masked: false, source: 'base' },
        { key: 'svc:web:domain:shop.example.com', area: 'domain', field: 'domain:shop.example.com', label: 'Domain', value: 'shop.example.com', masked: false, source: 'base' },
      ],
    },
  ],
  variables: [],
  linuxUsers: [{ name: 'shop', access: 'sftp', description: null, source: 'base', usedBy: ['web'] }],
}

function view(followsBase: boolean, changes = 0): EnvironmentConfigViewResponse {
  return {
    ok: true,
    environmentId: 'e',
    projectId: 'p1',
    followsBase,
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

  it('reads the Base of Compose projects only', () => {
    expect(wantsConfigView(project({}))).toBe(true)
    expect(wantsConfigView(project({ metadata: { type: 'managed' } }))).toBe(false)
  })
})

describe('a project card', () => {
  const production = env('e1', 'Production')
  const staging = env('e2', 'Staging')

  it('shows the Base line, who runs it and each environment', () => {
    const card = homeProject({
      project: project({ description: ' The shop ' }),
      environments: [production, staging],
      containersByEnvironment: { e1: [container('e1', 'running')], e2: [] },
      views: { e1: view(true, 2), e2: view(false) },
    })
    expect(card.name).toBe('Shop')
    expect(card.description).toBe('The shop')
    expect(card.sub).toBe('2 environments')
    expect(card.baseLine).toBe('Base · 1 service · 1 Linux user')
    expect(card.runs.map((chip) => chip.label)).toEqual(['Runs as shop'])
    expect(card.environments).toEqual([
      {
        id: 'e1',
        name: 'Production',
        status: 'running',
        relation: expect.objectContaining({ text: 'Follows the Base · 2 changes' }),
        host: 'shop.example.com',
      },
      {
        id: 'e2',
        name: 'Staging',
        status: 'never',
        relation: expect.objectContaining({ text: 'Stands alone' }),
        host: 'shop.example.com',
      },
    ])
    expect(card.status).toBe('never')
  })

  it('leaves out what has not been read yet', () => {
    const card = homeProject({
      project: project({ name: null }),
      environments: [env('e1', null)],
      containersByEnvironment: undefined,
      views: {},
    })
    expect(card.name).toBe('Unnamed project')
    expect(card.baseLine).toBeNull()
    expect(card.runs).toEqual([])
    expect(card.environments[0]).toEqual({
      id: 'e1',
      name: 'Environment',
      status: 'unknown',
      relation: null,
      host: null,
    })
    expect(card.status).toBe('unknown')
  })

  it('treats an environment with no container list entry as not deployed', () => {
    const card = homeProject({
      project: project({}),
      environments: [production],
      containersByEnvironment: {},
      views: {},
    })
    expect(card.environments[0]?.status).toBe('never')
  })

  it('gives a managed project a plain card, ignoring any config view', () => {
    const card = homeProject({
      project: project({ metadata: { type: 'managed' } }),
      environments: [production],
      containersByEnvironment: {},
      views: { e1: view(true, 1) },
    })
    expect(card.sub).toBe('Managed database · 1 environment')
    expect(card.baseLine).toBeNull()
    expect(card.runs).toEqual([])
    expect(card.environments[0]?.relation).toBeNull()
    expect(card.environments[0]?.host).toBeNull()
  })

  it('gives a platform project no environment rows, only its status', () => {
    const card = homeProject({
      project: project({ metadata: { type: 'system' } }),
      environments: [env('e1', 'HTTP Ingress'), env('e2', 'HTTP Ingress')],
      containersByEnvironment: { e1: [container('e1', 'running')], e2: [container('e2', 'exited')] },
      views: {},
    })
    expect(card.environments).toEqual([])
    expect(card.status).toBe('stopped')
  })

  it('names the other kinds without a count', () => {
    const none = { containersByEnvironment: {}, views: {} }
    expect(
      homeProject({ project: project({ metadata: { type: 'empty' } }), environments: [], ...none }).sub,
    ).toBe('Not set up yet')
    expect(
      homeProject({ project: project({ metadata: { type: 'system' } }), environments: [production], ...none }).sub,
    ).toBe('Platform')
    expect(
      homeProject({ project: project({ metadata: { type: 'managed' } }), environments: [], ...none }).sub,
    ).toBe('Managed database')
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
      projects: [{ id: 'p1', name: 'Shop' }, { id: 'p2', name: null }],
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
