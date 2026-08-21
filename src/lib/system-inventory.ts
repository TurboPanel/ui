import type {
  EnvironmentRecord,
  ProjectRecord,
  WorkspaceKind,
  WorkspaceRecord,
} from '@/lib/instance-api'

/** Workspace kind value for the platform-managed TurboPanel workspace. */
export const TURBOPANEL_WORKSPACE_KIND: WorkspaceKind = 'turbopanel'

/** Idempotency key for the per-server hosting ingress Traefik stack. */
export const SYSTEM_HOSTING_INGRESS_COMPONENT = 'hosting-ingress'
export const SYSTEM_MANAGED_INGRESS_COMPONENT = 'managed-ingress'
export const SYSTEM_MANAGED_HA_COMPONENT = 'managed-ha'
export const SYSTEM_SELF_HOST_COMPONENT = 'turbopanel'

/**
 * Allowlisted system components that may be restarted via
 * `POST /servers/:id/system/:component/restart` (mirrors the instance route).
 */
export const SYSTEM_OPERATE_COMPONENTS = [
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  SYSTEM_MANAGED_INGRESS_COMPONENT,
] as const

/** Read-side `metadata.type` stamp for platform-owned projects (presentation only). */
export const SYSTEM_PROJECT_METADATA_TYPE = 'system'

export type SystemOperateComponent = (typeof SYSTEM_OPERATE_COMPONENTS)[number]

/** Badge label for platform workspaces / projects — never derived from displayName. */
export const TURBOPANEL_WORKSPACE_BADGE_LABEL = 'Platform'

/** Platform-managed copy for TurboPanel workspace surfaces. */
export const TURBOPANEL_WORKSPACE_DESCRIPTION =
  'Platform managed — created and maintained by TurboPanel'

export function isTurbopanelWorkspace(
  workspace: Readonly<{ kind?: WorkspaceKind | null }>,
): boolean {
  return workspace.kind === TURBOPANEL_WORKSPACE_KIND
}

export function findTurbopanelWorkspace(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceRecord | null {
  return workspaces.find((workspace) => isTurbopanelWorkspace(workspace)) ?? null
}

/** User-facing lists and uniqueness checks — excludes the platform workspace. */
export function userWorkspaces(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceRecord[] {
  return workspaces.filter((workspace) => !isTurbopanelWorkspace(workspace))
}

export function isTurbopanelProject(
  project: Readonly<{ workspaceId: string; metadata?: ProjectRecord['metadata'] }>,
  workspacesOrKind: readonly WorkspaceRecord[] | WorkspaceKind | null | undefined,
): boolean {
  if (typeof workspacesOrKind === 'string') {
    return workspacesOrKind === TURBOPANEL_WORKSPACE_KIND
  }
  if (!workspacesOrKind) {
    return false
  }
  const workspace = workspacesOrKind.find(
    (entry) => entry.id === project.workspaceId,
  )
  return workspace != null && isTurbopanelWorkspace(workspace)
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

/** User-facing labels for system project component keys (not for auth). */
export function systemComponentLabel(component: string | null | undefined): string {
  switch (component) {
    case SYSTEM_HOSTING_INGRESS_COMPONENT:
      return 'HTTP/HTTPS Ingress'
    case SYSTEM_MANAGED_INGRESS_COMPONENT:
      return 'Database Ingress'
    case SYSTEM_MANAGED_HA_COMPONENT:
      return 'Database High-Availability'
    case SYSTEM_SELF_HOST_COMPONENT:
      return 'Self Hosted TurboPanel Instance'
    default:
      return component?.trim() || '—'
  }
}

export function isSystemOperateComponent(
  component: string,
): component is SystemOperateComponent {
  return (SYSTEM_OPERATE_COMPONENTS as readonly string[]).includes(component)
}
