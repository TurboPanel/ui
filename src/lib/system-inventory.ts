import type {
  EnvironmentRecord,
  ProjectRecord,
  WorkspaceKind,
  WorkspaceRecord,
} from '@/lib/instance-api'

/** Workspace kind value for the platform-managed System workspace. */
export const SYSTEM_WORKSPACE_KIND: WorkspaceKind = 'system'

/** Idempotency key for the per-server hosting ingress Traefik stack. */
export const SYSTEM_HOSTING_INGRESS_COMPONENT = 'hosting-ingress'

/**
 * Allowlisted system components that may be restarted via
 * `POST /servers/:id/system/:component/restart` (mirrors the instance route).
 */
export const SYSTEM_OPERATE_COMPONENTS = [
  SYSTEM_HOSTING_INGRESS_COMPONENT,
] as const

export type SystemOperateComponent = (typeof SYSTEM_OPERATE_COMPONENTS)[number]

/** Badge label for system workspaces / projects — never derived from displayName. */
export const SYSTEM_WORKSPACE_BADGE_LABEL = 'Platform'

/** Platform-managed copy for system workspace surfaces. */
export const SYSTEM_WORKSPACE_DESCRIPTION =
  'Platform managed — created and maintained by TurboPanel'

export function isSystemWorkspace(
  workspace: Readonly<{ kind?: WorkspaceKind | string | null }>,
): boolean {
  return workspace.kind === SYSTEM_WORKSPACE_KIND
}

export function findSystemWorkspace(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceRecord | null {
  return workspaces.find((workspace) => isSystemWorkspace(workspace)) ?? null
}

/** User-facing lists and uniqueness checks — excludes the system workspace. */
export function userWorkspaces(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceRecord[] {
  return workspaces.filter((workspace) => !isSystemWorkspace(workspace))
}

export function isSystemProject(
  project: Readonly<{ workspaceId: string; metadata?: ProjectRecord['metadata'] }>,
  workspacesOrKind: readonly WorkspaceRecord[] | WorkspaceKind | null | undefined,
): boolean {
  if (typeof workspacesOrKind === 'string') {
    return workspacesOrKind === SYSTEM_WORKSPACE_KIND
  }
  if (!workspacesOrKind) {
    return false
  }
  const workspace = workspacesOrKind.find(
    (entry) => entry.id === project.workspaceId,
  )
  return workspace != null && isSystemWorkspace(workspace)
}

export function systemComponentKey(
  project: Readonly<{ metadata?: ProjectRecord['metadata'] }>,
): string | null {
  const component = project.metadata?.component
  if (typeof component !== 'string') {
    return null
  }
  const trimmed = component.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Environment in the hosting-ingress project whose `serverId` matches.
 * Does not branch on display names.
 */
export function findServerIngressEnvironment(
  environments: readonly EnvironmentRecord[],
  serverId: string,
): EnvironmentRecord | null {
  if (!serverId) {
    return null
  }
  return (
    environments.find((environment) => environment.serverId === serverId) ??
    null
  )
}

export function isSystemOperateComponent(
  component: string,
): component is SystemOperateComponent {
  return (SYSTEM_OPERATE_COMPONENTS as readonly string[]).includes(component)
}
