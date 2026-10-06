import { useState } from 'react'
import type { CrashRetry } from '@/components/org/project/environment-overview/crash-sheet'
import { useRunEnvironmentLifecycle } from '@/lib/queries/environments'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Retry for the Crash sheet: restart the environment's apps. A restart is the
 * control plane's own lifecycle call, not a deploy, so saved changes that are
 * not deployed yet stay where they are.
 */
export function useCrashRetry(orgId: string, environmentId: string, canManage: boolean): CrashRetry {
  const lifecycle = useRunEnvironmentLifecycle(orgId, environmentId)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onRetry = () => {
    if (lifecycle.isPending) return
    setError(null)
    setRequested(false)
    lifecycle.run('restart').then((result) => {
      if (result.ok) setRequested(true)
      else setError(userErrorMessage(result.cause, result.error ?? 'Could not restart. Try again.'))
    }, () => setError('Could not restart. Try again.'))
  }
  const reset = () => {
    setRequested(false)
    setError(null)
  }
  return { canRetry: canManage, busy: lifecycle.isPending, requested, error, onRetry, reset }
}
