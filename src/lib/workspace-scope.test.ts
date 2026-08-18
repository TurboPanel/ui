import { describe, expect, it } from 'vitest'
import { ORG_AREAS } from './org-navigation'
import {
  ALL_WORKSPACES_SCOPE,
  manageWorkspacesHref,
  newProjectHrefForScope,
  parseWorkspaceIdParam,
  projectsHrefForScope,
  resolveWorkspaceScope,
  workspaceDisplayName,
  workspaceScopeStorageKey,
} from './workspace-scope'
import type { WorkspaceRecord } from './instance-api'

const WORKSPACES: WorkspaceRecord[] = [
  {
    id: 'ws-a',
    displayName: 'Alpha',
    description: null,
    organizationId: 'org-1',
    kind: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ws-b',
    displayName: '  ',
    description: 'blank name',
    organizationId: 'org-1',
    kind: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const PLATFORM_WORKSPACE: WorkspaceRecord = {
  id: 'ws-platform',
  displayName: 'TurboPanel Platform',
  description: null,
  organizationId: 'org-1',
  kind: 'turbopanel',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ORG_AREAS navigation', () => {
  it('does not list workspaces or organization management as top-level areas', () => {
    const areaIds = ORG_AREAS.map((area) => area.id as string)
    expect(areaIds.includes('workspaces')).toBe(false)
    expect(areaIds.includes('manage')).toBe(false)
    expect(areaIds).toEqual([
      'overview',
      'projects',
      'managed',
      'servers',
      'network',
      'access',
    ])
  })
})

describe('resolveWorkspaceScope', () => {
  it('defaults to all workspaces even when only one user workspace exists', () => {
    expect(resolveWorkspaceScope(WORKSPACES, null)).toEqual({
      id: ALL_WORKSPACES_SCOPE,
      label: 'All workspaces',
      workspace: null,
    })
    expect(resolveWorkspaceScope(WORKSPACES, ALL_WORKSPACES_SCOPE).id).toBe(
      ALL_WORKSPACES_SCOPE,
    )
    const sole = [WORKSPACES[0]!]
    expect(resolveWorkspaceScope(sole, null)).toEqual({
      id: ALL_WORKSPACES_SCOPE,
      label: 'All workspaces',
      workspace: null,
    })
    expect(resolveWorkspaceScope(sole, ALL_WORKSPACES_SCOPE)).toEqual({
      id: ALL_WORKSPACES_SCOPE,
      label: 'All workspaces',
      workspace: null,
    })
  })

  it('resolves a known workspace', () => {
    expect(resolveWorkspaceScope(WORKSPACES, 'ws-a')).toEqual({
      id: 'ws-a',
      label: 'Alpha',
      workspace: WORKSPACES[0],
    })
  })

  it('falls back to all workspaces for unknown ids', () => {
    expect(resolveWorkspaceScope(WORKSPACES, 'missing').id).toBe(
      ALL_WORKSPACES_SCOPE,
    )
    const withPlatform = [WORKSPACES[0]!, PLATFORM_WORKSPACE]
    expect(resolveWorkspaceScope(withPlatform, 'missing')).toEqual({
      id: ALL_WORKSPACES_SCOPE,
      label: 'All workspaces',
      workspace: null,
    })
  })

  it('never falls back to the platform workspace for unknown ids', () => {
    const withPlatform = [WORKSPACES[0]!, PLATFORM_WORKSPACE]
    expect(resolveWorkspaceScope(withPlatform, 'missing').workspace).toBeNull()
  })

  it('allows explicit selection of the TurboPanel platform workspace', () => {
    const withPlatform = [WORKSPACES[0]!, PLATFORM_WORKSPACE]
    expect(resolveWorkspaceScope(withPlatform, 'ws-platform')).toEqual({
      id: 'ws-platform',
      label: 'TurboPanel Platform',
      workspace: PLATFORM_WORKSPACE,
    })
  })
})

describe('workspace scope href helpers', () => {
  it('builds projects URLs for all and single scopes', () => {
    expect(projectsHrefForScope('org-1', ALL_WORKSPACES_SCOPE)).toBe(
      '/org-1/projects',
    )
    expect(projectsHrefForScope('org-1', 'ws-a')).toBe(
      '/org-1/projects?workspaceId=ws-a',
    )
  })

  it('builds new-project URLs and manage href', () => {
    expect(newProjectHrefForScope('org-1', ALL_WORKSPACES_SCOPE)).toBe(
      '/org-1/projects/new',
    )
    expect(newProjectHrefForScope('org-1', 'ws-a')).toBe(
      '/org-1/projects/new?workspaceId=ws-a',
    )
    expect(manageWorkspacesHref('org-1')).toBe('/org-1/workspaces')
  })

  it('parses workspace query params', () => {
    expect(parseWorkspaceIdParam('ws-a')).toBe('ws-a')
    expect(parseWorkspaceIdParam(['ws-a'])).toBeUndefined()
    expect(parseWorkspaceIdParam(undefined)).toBeUndefined()
    expect(parseWorkspaceIdParam('')).toBeUndefined()
  })
})

describe('workspaceDisplayName', () => {
  it('falls back when display name is blank', () => {
    expect(workspaceDisplayName(WORKSPACES[0]!)).toBe('Alpha')
    expect(workspaceDisplayName(WORKSPACES[1]!)).toBe('Unnamed workspace')
  })

  it('uses a stable localStorage key per org', () => {
    expect(workspaceScopeStorageKey('org-1')).toBe(
      'turbopanel.lastWorkspaceScope:org-1',
    )
  })
})
