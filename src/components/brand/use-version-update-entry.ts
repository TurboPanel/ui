import { useGlobalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import { useServersUpdateStatus } from '@/lib/queries/servers'
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
 * organization's servers reads that organization's server update status;
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
  const servers = useServersUpdateStatus(org, { enabled: viewer === 'org-manager' })
  const adminPending = instanceAdminUpdatePending({
    updates: updates.data,
    activeRun: Boolean(active.data?.run),
    consoleBuild,
  })
  return {
    viewer,
    pending: viewerUpdatePending({ viewer, adminPending, servers: servers.data?.servers }),
    orgId: org,
  }
}
