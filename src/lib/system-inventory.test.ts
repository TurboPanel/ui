import { describe, expect, it } from 'vitest'
import type { EnvironmentRecord, ProjectRecord, WorkspaceRecord } from './instance-api'
import {
  findServerIngressEnvironment,
  findSystemWorkspace,
  isSystemProject,
  isSystemWorkspace,
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  SYSTEM_WORKSPACE_BADGE_LABEL,
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
  it('is driven by kind — a user workspace named System is not platform', () => {
    const namedSystem = workspace({
      id: 'ws-user-system',
      kind: 'user',
      displayName: 'System',
    })
    expect(isSystemWorkspace(namedSystem)).toBe(false)
    expect(SYSTEM_WORKSPACE_BADGE_LABEL).toBe('Platform')
  })

  it('findSystemWorkspace returns the kind=system row even when others are named System', () => {
    const workspaces = [
      workspace({ id: 'ws-a', kind: 'user', displayName: 'System' }),
      workspace({ id: 'ws-sys', kind: 'system', displayName: 'System' }),
      workspace({ id: 'ws-b', kind: 'user', displayName: 'Default' }),
    ]
    expect(findSystemWorkspace(workspaces)?.id).toBe('ws-sys')
    expect(userWorkspaces(workspaces).map((row) => row.id)).toEqual([
      'ws-a',
      'ws-b',
    ])
  })

  it('isSystemProject resolves via workspace kind or an explicit kind', () => {
    const workspaces = [
      workspace({ id: 'ws-user', kind: 'user' }),
      workspace({ id: 'ws-sys', kind: 'system' }),
    ]
    const userProject = project({ id: 'p1', workspaceId: 'ws-user' })
    const systemProject = project({
      id: 'p2',
      workspaceId: 'ws-sys',
      metadata: { type: 'docker-compose', component: 'hosting-ingress' },
    })
    expect(isSystemProject(userProject, workspaces)).toBe(false)
    expect(isSystemProject(systemProject, workspaces)).toBe(true)
    expect(isSystemProject(systemProject, 'system')).toBe(true)
    expect(isSystemProject(userProject, 'user')).toBe(false)
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
