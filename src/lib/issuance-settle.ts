import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { isControlPlaneRestartError } from '@/lib/control-plane-recovery'

/**
 * After an apply whose connection dropped, a Let's Encrypt name may still be
 * getting its certificate. Look at the hostname rows for a short while before
 * deciding, and only trust an issuance error that is newer than the apply.
 */
export const ISSUANCE_POLL_TIMEOUT_MS = 75_000
export const ISSUANCE_POLL_INTERVAL_MS = 4_000
/** Browser and server clocks are not in step; allow a few seconds. */
const CLOCK_SKEW_MS = 5_000

export type IssuanceSettled =
  | { kind: 'issued'; rows: InstanceHostnameRecord[] }
  | { kind: 'not-issued'; rows: InstanceHostnameRecord[]; error: string }

type Verdict =
  { state: 'issued' } | { state: 'failed'; message: string } | { state: 'pending'; message: string }

function isFreshError(row: InstanceHostnameRecord, startedAt: number): boolean {
  if (!row.acmeLastError || !row.acmeLastAttemptAt) return false
  const attempt = Date.parse(row.acmeLastAttemptAt)
  return !Number.isNaN(attempt) && attempt >= startedAt - CLOCK_SKEW_MS
}

export function judgeIssuance(rows: readonly InstanceHostnameRecord[], startedAt: number): Verdict {
  const names = rows.filter((row) => row.source === 'lets-encrypt')
  const failed = names.find((row) => isFreshError(row, startedAt))
  if (failed) {
    return {
      state: 'failed',
      message: `Let's Encrypt could not issue a certificate for ${failed.host}: ${failed.acmeLastError}. Fix the cause, then apply again.`,
    }
  }
  const waiting = names.find((row) => !row.notAfter)
  if (waiting) {
    return {
      state: 'pending',
      message: `Let's Encrypt has not confirmed a certificate for ${waiting.host} yet. Check the Certificate column in a minute, and apply again if it stays empty.`,
    }
  }
  return { state: 'issued' }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export async function settleIssuance({
  rows,
  startedAt,
  refetch,
  timeoutMs = ISSUANCE_POLL_TIMEOUT_MS,
  intervalMs = ISSUANCE_POLL_INTERVAL_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
}: Readonly<{
  rows: InstanceHostnameRecord[]
  startedAt: number
  refetch: () => Promise<InstanceHostnameRecord[]>
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>): Promise<IssuanceSettled> {
  const deadline = now() + timeoutMs
  const look = async (current: InstanceHostnameRecord[]): Promise<IssuanceSettled> => {
    const verdict = judgeIssuance(current, startedAt)
    if (verdict.state === 'issued') return { kind: 'issued', rows: current }
    if (verdict.state === 'failed' || now() >= deadline) {
      return { kind: 'not-issued', rows: current, error: verdict.message }
    }
    await sleep(intervalMs)
    try {
      return await look(await refetch())
    } catch (err) {
      if (!isControlPlaneRestartError(err)) throw err
      return look(current)
    }
  }
  return look(rows)
}
