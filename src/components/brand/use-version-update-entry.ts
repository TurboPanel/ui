import { useMemo } from 'react'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import { instanceAdminUpdatePending } from '@/lib/update-entry'

/**
 * Whether the update icon shows for this viewer. Only instance admins read
 * the instance update status; organization managers and members read
 * nothing and never see the icon.
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
  const pending =
    isInstanceAdmin &&
    instanceAdminUpdatePending({
      updates: updates.data,
      activeRun: Boolean(active.data?.run),
      consoleBuild,
    })
  return { isInstanceAdmin, pending }
}
