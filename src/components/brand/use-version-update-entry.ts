import { useGlobalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import { useOrgServers, useServersUpdateStatus } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import {
  canUpdateOrgServers,
  instanceAdminUpdatePending,
  updateViewer,
  viewerUpdatePending,
  type UpdateViewer,
} from '@/lib/update-entry'

/**
 * Whether this viewer has an update to apply, and who they are for routing.
 * Instance admins read the instance update status (control plane, web
 * interface and every connected daemon); someone who can update the
 * organization's servers reads that organization's servers and their update
 * status (the same rows the Servers page reads);
 * anyone else reads nothing. The organization is the one in the route
 * (`/[orgId]/…`), when there is one; it is returned for routing.
 */
export function useVersionUpdateEntry(): Readonly<{
  viewer: UpdateViewer
  pending: boolean
  orgId: string
}> {
  const { session } = useAuth()
  const { orgId } = useGlobalSearchParams<{ orgId?: string | string[] }>()
  const org = (Array.isArray(orgId) ? orgId[0] : orgId)?.trim() ?? ''
  const canManageOrganization = useCan(org ? 'organization' : null, org, 'organization:manage')
  const viewer = updateViewer({
    isInstanceAdmin: isAdminSession(session),
    canUpdateOrgServers: canUpdateOrgServers({ canManageOrganization }),
  })
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const isAdmin = viewer === 'instance-admin'
  const updates = useInstanceUpdates({ enabled: isAdmin, consoleCommit: consoleBuild?.commit })
  const active = useUpgradeActiveRun({ enabled: isAdmin })
  const isManager = viewer === 'org-manager'
  const servers = useOrgServers(org, { enabled: isManager })
  const serverUpdates = useServersUpdateStatus(org, { enabled: isManager })
  const adminPending = instanceAdminUpdatePending({
    updates: updates.data,
    activeRun: Boolean(active.data?.run),
    consoleBuild,
  })
  return {
    viewer,
    pending: viewerUpdatePending({
      viewer,
      adminPending,
      servers: servers.data?.servers,
      updates: serverUpdates.data?.servers,
    }),
    orgId: org,
  }
}
