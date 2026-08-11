import { describe, expect, it } from 'vitest'
import type { EnvironmentRecord, ProjectRecord, WorkspaceRecord } from './instance-api'
import {
  findServerIngressEnvironment,
  findTurbopanelWorkspace,
  isTurbopanelProject,
  isTurbopanelWorkspace,
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  TURBOPANEL_WORKSPACE_BADGE_LABEL,
  systemComponentKey,
  userWorkspaces,
} from './system-inventory'

function workspace(
  partial: Partial<WorkspaceRecord> & Pick<WorkspaceRecord, 'id' | 'kind'>,
): WorkspaceRecord {
  return {
    displayName: partial.displayName ?? 'Workspace',
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
    displayName: 'Project',
    description: null,
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('system-inventory', () => {
  it('is driven by kind — a user workspace named TurboPanel Platform is not platform', () => {
    const namedPlatform = workspace({
      id: 'ws-user-platform',
      kind: 'user',
      displayName: 'TurboPanel Platform',
    })
    expect(isTurbopanelWorkspace(namedPlatform)).toBe(false)
    expect(TURBOPANEL_WORKSPACE_BADGE_LABEL).toBe('Platform')
  })

  it('findTurbopanelWorkspace returns the kind=turbopanel row', () => {
    const workspaces = [
      workspace({ id: 'ws-a', kind: 'user', displayName: 'TurboPanel Platform' }),
      workspace({
        id: 'ws-tp',
        kind: 'turbopanel',
        displayName: 'TurboPanel Platform',
      }),
      workspace({ id: 'ws-b', kind: 'user', displayName: 'Default' }),
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
  })

  it('findServerIngressEnvironment matches on serverId', () => {
    const environments: EnvironmentRecord[] = [
      {
        id: 'env-a',
        displayName: 'Server A',
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
        displayName: 'Server B',
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
  })
})
