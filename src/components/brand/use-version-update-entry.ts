import { useMemo } from 'react'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { isAdminSession, isSuperadminSession, useAuth } from '@/lib/auth-context'
import { developmentChangesPending, isDevelopmentInstall } from '@/lib/development-updates'
import { useDevelopmentUpdates, useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import { instanceAdminUpdatePending } from '@/lib/update-entry'

/**
 * Whether the update icon shows for this viewer. Only instance admins read
 * the instance update status; organization managers and members read
 * nothing and never see the icon. On a development install the icon shows
 * only while some server lacks the checkout's daemon changes.
 */
export function useVersionUpdateEntry(): Readonly<{ isInstanceAdmin: boolean; pending: boolean }> {
  const { session } = useAuth()
  const isInstanceAdmin = isAdminSession(session)
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const updates = useInstanceUpdates({
    enabled: isInstanceAdmin,
    consoleCommit: consoleBuild?.commit,
  })
  const active = useUpgradeActiveRun({ enabled: isInstanceAdmin })
  const development = useDevelopmentUpdates({
    // The development route is superadmin only; a plain admin would get a 403.
    enabled: isSuperadminSession(session) && isDevelopmentInstall(updates.data),
  })
  const pending =
    isInstanceAdmin &&
    instanceAdminUpdatePending({
      updates: updates.data,
      activeRun: Boolean(active.data?.run),
      consoleBuild,
      developmentPending: developmentChangesPending(development.data),
    })
  return { isInstanceAdmin, pending }
}
