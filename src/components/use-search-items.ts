import { useMemo } from 'react'
import { useAuth, isAdminSession } from '@/lib/auth-context'
import { useDatacenters, useOrgServers, useOrganizationManaged, useProjects } from '@/lib/queries'
import { useCan } from '@/lib/query-client'
import { buildSearchItems, type SearchItem } from '@/lib/search-index'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

/**
 * Everything the search can open or do for an organization. The lists reuse the
 * queries the Servers, Projects, Managed and Datacenters pages already run, and
 * are only read while the search is open (`enabled`).
 */
export function useSearchItems(orgId: string, enabled: boolean): SearchItem[] {
  const { billingEnabled, session } = useAuth()
  const scopeId = useOptionalWorkspaceScope()?.scopeId ?? ALL_WORKSPACES_SCOPE
  const canManage = useCan('organization', orgId, 'organization:manage')
  const canOwn = useCan('organization', orgId, 'organization:own')
  const servers = useOrgServers(orgId, { enabled })
  const projects = useProjects(orgId, undefined, { enabled })
  const managed = useOrganizationManaged(orgId, { enabled })
  const datacenters = useDatacenters(orgId, { enabled })
  const isPlatformAdmin = isAdminSession(session)

  const serverRows = servers.data?.servers
  const projectRows = projects.data?.projects
  const managedRows = managed.data?.managed
  const datacenterRows = datacenters.data?.datacenters

  return useMemo(
    () =>
      buildSearchItems(orgId, {
        billingEnabled,
        projectsScopeId: scopeId,
        canManage,
        canOwn,
        isPlatformAdmin,
        servers: serverRows ?? [],
        projects: (projectRows ?? []).map((project) => ({
          id: project.id,
          name: project.name,
          type: project.kind,
        })),
        databases: (managedRows ?? []).map((row) => ({
          id: row.id,
          projectId: row.projectId,
          name: row.name?.trim() || row.projectName,
          engineName: row.engineDisplayName,
          status: row.status,
        })),
        datacenters: datacenterRows ?? [],
      }),
    [
      orgId,
      billingEnabled,
      scopeId,
      canManage,
      canOwn,
      isPlatformAdmin,
      serverRows,
      projectRows,
      managedRows,
      datacenterRows,
    ]
  )
}
