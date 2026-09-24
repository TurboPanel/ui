import { isControlPlaneRestartError } from '@/lib/control-plane-recovery'
import type { UpgradeRunStatus } from '@/lib/upgrade-vocabulary'
import { UPGRADE_RUN_ACTIVE_STATUSES } from '@/lib/upgrade-vocabulary'

const ACTIVE = new Set<string>(UPGRADE_RUN_ACTIVE_STATUSES)

export function isUpgradeRunActive(status: UpgradeRunStatus | null | undefined): boolean {
  return status != null && ACTIVE.has(status)
}

export const UPGRADE_RUN_POLL_MS = 2_000

export const UPGRADE_RUN_WAIT_MS = 45 * 60 * 1000

export type UpgradeRunPollOutcome =
  | { kind: 'completed'; status: UpgradeRunStatus }
  | { kind: 'missing' }
  | { kind: 'still_active' }
  | { kind: 'unreachable' }

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Poll the active upgrade run until it leaves `pending` / `running`, the
 * deadline passes, or the control plane stops answering restart-shaped errors.
 */
export async function waitForUpgradeRunSettlement({
  readRun,
  timeoutMs = UPGRADE_RUN_WAIT_MS,
  intervalMs = UPGRADE_RUN_POLL_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
}: Readonly<{
  readRun: () => Promise<{ status: UpgradeRunStatus } | null>
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>): Promise<UpgradeRunPollOutcome> {
  const deadline = now() + timeoutMs
  for (;;) {
    if (now() >= deadline) return { kind: 'unreachable' }
    try {
      const run = await readRun()
      if (!run) return { kind: 'missing' }
      if (!isUpgradeRunActive(run.status)) {
        return { kind: 'completed', status: run.status }
      }
    } catch (err) {
      if (!isControlPlaneRestartError(err)) throw err
    }
    const remaining = deadline - now()
    if (remaining <= 0) return { kind: 'unreachable' }
    await sleep(Math.min(intervalMs, remaining))
  }
}
