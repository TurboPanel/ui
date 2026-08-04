import type { WorkspaceRecord } from './instance-api'
import { isSystemWorkspace, userWorkspaces } from './system-inventory'

/** Sentinel for the organization-wide (unfiltered) projects view. */
export const ALL_WORKSPACES_SCOPE = 'all'

export type WorkspaceScope = Readonly<{
  /** `'all'` or a workspace UUID. */
  id: string
  label: string
  workspace: WorkspaceRecord | null
}>

export function workspaceDisplayName(workspace: WorkspaceRecord): string {
  return workspace.displayName?.trim() || 'Unnamed workspace'
}

function soleWorkspaceScope(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceScope | null {
  // Sole-workspace auto-select must ignore the platform System workspace,
  // otherwise every org looks like it has ≥2 workspaces and All stays visible.
  const users = userWorkspaces(workspaces)
  if (users.length !== 1) {
    return null
  }
  const workspace = users[0]
  if (!workspace) {
    return null
  }
  return {
    id: workspace.id,
    label: workspaceDisplayName(workspace),
    workspace,
  }
}

function allWorkspacesScope(): WorkspaceScope {
  return {
    id: ALL_WORKSPACES_SCOPE,
    label: 'All workspaces',
    workspace: null,
  }
}

export function resolveWorkspaceScope(
  workspaces: readonly WorkspaceRecord[],
  requestedId: string | null | undefined,
): WorkspaceScope {
  const sole = soleWorkspaceScope(workspaces)

  if (!requestedId || requestedId === ALL_WORKSPACES_SCOPE) {
    return sole ?? allWorkspacesScope()
  }

  const workspace = workspaces.find((entry) => entry.id === requestedId) ?? null
  if (!workspace) {
    // Unknown / absent ids never fall back *to* the system workspace.
    return sole ?? allWorkspacesScope()
  }

  // Explicit selection of the system workspace is allowed.
  if (isSystemWorkspace(workspace)) {
    return {
      id: workspace.id,
      label: workspaceDisplayName(workspace),
      workspace,
    }
  }

  return {
    id: workspace.id,
    label: workspaceDisplayName(workspace),
    workspace,
  }
}

export function projectsHrefForScope(
  orgId: string,
  scopeId: string,
): `/${string}/projects` | `/${string}/projects?workspaceId=${string}` {
  if (scopeId === ALL_WORKSPACES_SCOPE) {
    return `/${orgId}/projects`
  }
  return `/${orgId}/projects?workspaceId=${encodeURIComponent(scopeId)}`
}

export function newProjectHrefForScope(
  orgId: string,
  scopeId: string,
): `/${string}/projects/new` | `/${string}/projects/new?workspaceId=${string}` {
  if (scopeId === ALL_WORKSPACES_SCOPE) {
    return `/${orgId}/projects/new`
  }
  return `/${orgId}/projects/new?workspaceId=${encodeURIComponent(scopeId)}`
}

export function manageWorkspacesHref(orgId: string): `/${string}/workspaces` {
  return `/${orgId}/workspaces`
}

export function newWorkspaceHref(orgId: string): `/${string}/workspaces/new` {
  return `/${orgId}/workspaces/new`
}

export function parseWorkspaceIdParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return undefined
}

const STORAGE_KEY_PREFIX = 'turbopanel.lastWorkspaceScope:'

export function workspaceScopeStorageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}${orgId}`
}

export function getStoredWorkspaceScopeId(orgId: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const value = localStorage.getItem(workspaceScopeStorageKey(orgId))?.trim()
  return value && value.length > 0 ? value : null
}

export function setStoredWorkspaceScopeId(
  orgId: string,
  scopeId: string,
): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(workspaceScopeStorageKey(orgId), scopeId)
}

export function clearStoredWorkspaceScopeId(orgId: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(workspaceScopeStorageKey(orgId))
}
