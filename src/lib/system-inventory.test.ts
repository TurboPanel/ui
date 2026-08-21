import { describe, expect, it } from 'vitest'
import type { EnvironmentRecord, ProjectRecord, WorkspaceRecord } from './instance-api'
import {
  findServerIngressEnvironment,
  findTurbopanelWorkspace,
  isSystemOperateComponent,
  isTurbopanelProject,
  isTurbopanelWorkspace,
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  SYSTEM_MANAGED_HA_COMPONENT,
  SYSTEM_MANAGED_INGRESS_COMPONENT,
  SYSTEM_SELF_HOST_COMPONENT,
  TURBOPANEL_WORKSPACE_BADGE_LABEL,
  systemComponentKey,
  systemComponentLabel,
  userWorkspaces,
} from './system-inventory'

function workspace(
  partial: Partial<WorkspaceRecord> & Pick<WorkspaceRecord, 'id' | 'kind'>,
): WorkspaceRecord {
  return {
    name: partial.name ?? 'Workspace',
    description: partial.description ?? null,
    organizationId: 'org-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function project(
  partial: Partial<ProjectRecord> & Pick<ProjectRecord, 'id' | 'workspaceId'>,
): ProjectRecord {
  return {
    name: 'Project',
    description: null,
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('system-inventory', () => {
  it('is driven by kind — a user workspace named TurboPanel is not platform', () => {
    const namedPlatform = workspace({
      id: 'ws-user-platform',
      kind: 'user',
      name: 'TurboPanel',
    })
    expect(isTurbopanelWorkspace(namedPlatform)).toBe(false)
    expect(TURBOPANEL_WORKSPACE_BADGE_LABEL).toBe('Platform')
  })

  it('findTurbopanelWorkspace returns the kind=turbopanel row', () => {
    const workspaces = [
      workspace({ id: 'ws-a', kind: 'user', name: 'TurboPanel' }),
      workspace({
        id: 'ws-tp',
        kind: 'turbopanel',
        name: 'TurboPanel',
      }),
      workspace({ id: 'ws-b', kind: 'user', name: 'Default' }),
    ]
    expect(findTurbopanelWorkspace(workspaces)?.id).toBe('ws-tp')
    expect(userWorkspaces(workspaces).map((row) => row.id)).toEqual([
      'ws-a',
      'ws-b',
    ])
  })

  it('isTurbopanelProject resolves via workspace kind or an explicit kind', () => {
    const workspaces = [
      workspace({ id: 'ws-user', kind: 'user' }),
      workspace({ id: 'ws-tp', kind: 'turbopanel' }),
    ]
    const userProject = project({ id: 'p1', workspaceId: 'ws-user' })
    const platformProject = project({
      id: 'p2',
      workspaceId: 'ws-tp',
      metadata: { type: 'docker-compose', component: 'hosting-ingress' },
    })
    expect(isTurbopanelProject(userProject, workspaces)).toBe(false)
    expect(isTurbopanelProject(platformProject, workspaces)).toBe(true)
    expect(isTurbopanelProject(platformProject, 'turbopanel')).toBe(true)
    expect(isTurbopanelProject(userProject, 'user')).toBe(false)
    expect(isTurbopanelProject(platformProject, null)).toBe(false)
    expect(isTurbopanelProject(platformProject, undefined)).toBe(false)
  })

  it('systemComponentKey reads metadata.component', () => {
    expect(systemComponentKey(project({ id: 'p1', workspaceId: 'w' }))).toBeNull()
    expect(
      systemComponentKey(
        project({
          id: 'p2',
          workspaceId: 'w',
          metadata: { component: SYSTEM_HOSTING_INGRESS_COMPONENT },
        }),
      ),
    ).toBe('hosting-ingress')
    expect(
      systemComponentKey(
        project({
          id: 'p3',
          workspaceId: 'w',
          metadata: { component: '   ' },
        }),
      ),
    ).toBeNull()
    expect(
      systemComponentKey(
        project({
          id: 'p4',
          workspaceId: 'w',
          metadata: { component: 42 as unknown as string },
        }),
      ),
    ).toBeNull()
  })

  it('findServerIngressEnvironment matches on serverId', () => {
    const environments: EnvironmentRecord[] = [
      {
        id: 'env-a',
        name: 'Server A',
        description: null,
        projectId: 'proj',
        serverId: 'srv-a',
        metadata: null,
        options: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'env-b',
        name: 'Server B',
        description: null,
        projectId: 'proj',
        serverId: 'srv-b',
        metadata: null,
        options: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    expect(findServerIngressEnvironment(environments, 'srv-b')?.id).toBe('env-b')
    expect(findServerIngressEnvironment(environments, 'missing')).toBeNull()
    expect(findServerIngressEnvironment(environments, '')).toBeNull()
  })

  it('systemComponentLabel maps known keys and falls back for unknowns', () => {
    expect(systemComponentLabel(SYSTEM_HOSTING_INGRESS_COMPONENT)).toBe(
      'HTTP/HTTPS Ingress',
    )
    expect(systemComponentLabel(SYSTEM_MANAGED_INGRESS_COMPONENT)).toBe(
      'Database Ingress',
    )
    expect(systemComponentLabel(SYSTEM_MANAGED_HA_COMPONENT)).toBe(
      'Database High-Availability',
    )
    expect(systemComponentLabel(SYSTEM_SELF_HOST_COMPONENT)).toBe(
      'Self Hosted TurboPanel Instance',
    )
    expect(systemComponentLabel('custom-component')).toBe('custom-component')
    expect(systemComponentLabel('  ')).toBe('—')
    expect(systemComponentLabel(null)).toBe('—')
    expect(systemComponentLabel(undefined)).toBe('—')
  })

  it('isSystemOperateComponent allowlists restartable components', () => {
    expect(isSystemOperateComponent(SYSTEM_HOSTING_INGRESS_COMPONENT)).toBe(true)
    expect(isSystemOperateComponent(SYSTEM_MANAGED_INGRESS_COMPONENT)).toBe(true)
    expect(isSystemOperateComponent('turbopanel')).toBe(false)
    expect(isSystemOperateComponent('redis')).toBe(false)
  })
})
