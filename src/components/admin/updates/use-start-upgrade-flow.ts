import { useState } from 'react'
import type { UpgradePreflightResult } from '@/lib/instance-api'
import { useRunUpgradePreflight, useStartPlatformUpgrade } from '@/lib/queries/admin'
import { UpgradeStartTimeoutError, withStartTimeout } from '@/lib/update-status'
import { UPDATE_ALREADY_ACTIVE_COPY, apiErrorCopy, userErrorMessage } from '@/lib/user-error'

/** The preflight sheet, starting an update, and the notice line they report through. */
export function useStartUpgradeFlow(refetchActiveRun: () => unknown, consoleCommit?: string) {
  const preflightMutation = useRunUpgradePreflight()
  const startUpgrade = useStartPlatformUpgrade(consoleCommit)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<UpgradePreflightResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const openPreflight = async () => {
    setNotice(null)
    try {
      const result = await preflightMutation.mutateAsync()
      setPreflight(result)
      setPreflightOpen(true)
    } catch (err) {
      setNotice(userErrorMessage(err, 'Preflight failed'))
    }
  }

  const confirmUpgrade = async () => {
    setStarting(true)
    try {
      const outcome = await withStartTimeout(startUpgrade.mutateAsync(preflight?.runId))
      setPreflightOpen(false)
      setNotice(
        `Update started (${outcome.runId.slice(0, 8)}). Progress shows below as each step reports.`
      )
    } catch (err) {
      if (err instanceof UpgradeStartTimeoutError) {
        // Never spin forever: close the sheet and let the status below say
        // whether a run started.
        setPreflightOpen(false)
        setNotice(
          'Still waiting for the control plane to confirm the update started. The progress below refreshes on its own; if nothing appears, check the daemon log on the server.'
        )
        void refetchActiveRun()
      } else if (apiErrorCopy(err) === UPDATE_ALREADY_ACTIVE_COPY) {
        setPreflightOpen(false)
        setNotice(UPDATE_ALREADY_ACTIVE_COPY)
        void refetchActiveRun()
      } else {
        setNotice(userErrorMessage(err, 'Update failed to start'))
      }
    } finally {
      setStarting(false)
    }
  }

  return {
    preflightPending: preflightMutation.isPending,
    preflightOpen,
    setPreflightOpen,
    preflight,
    notice,
    setNotice,
    starting,
    openPreflight,
    confirmUpgrade,
  }
}
