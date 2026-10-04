import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { isControlPlaneRestartError } from '@/lib/control-plane-recovery'

/**
 * After an apply whose connection dropped, a Let's Encrypt name may still be
 * getting its certificate. Look at the hostname rows for a short while before
 * deciding. Everything is judged against a snapshot of the same rows taken
 * before the apply, so only server values are compared with server values and
 * the browser clock plays no part.
 */
export const ISSUANCE_POLL_TIMEOUT_MS = 75_000
export const ISSUANCE_POLL_INTERVAL_MS = 4_000

type RowState = Pick<InstanceHostnameRecord, 'notAfter' | 'acmeLastAttemptAt' | 'acmeLastError'>

/** What each Let's Encrypt row looked like before the apply, by row id. */
export type IssuanceBaseline = ReadonlyMap<string, RowState>

export function takeIssuanceBaseline(rows: readonly InstanceHostnameRecord[]): IssuanceBaseline {
  return new Map(
    rows
      .filter((row) => row.source === 'lets-encrypt')
      .map((row) => [
        row.id,
        {
          notAfter: row.notAfter,
          acmeLastAttemptAt: row.acmeLastAttemptAt,
          acmeLastError: row.acmeLastError,
        },
      ])
  )
}

export type IssuanceSettled =
  | { kind: 'issued'; rows: InstanceHostnameRecord[] }
  | { kind: 'not-issued'; rows: InstanceHostnameRecord[]; error: string }

type Verdict =
  { state: 'issued' } | { state: 'failed'; message: string } | { state: 'pending'; message: string }

function attemptAdvanced(row: RowState, before: RowState | undefined): boolean {
  return row.acmeLastAttemptAt !== (before?.acmeLastAttemptAt ?? null)
}

function isNewError(row: RowState, before: RowState | undefined): boolean {
  if (!row.acmeLastError) return false
  return attemptAdvanced(row, before) || row.acmeLastError !== before?.acmeLastError
}

function isNewCertificate(row: RowState, before: RowState | undefined): boolean {
  if (!row.notAfter) return false
  if (!before?.notAfter) return true
  if (Date.parse(row.notAfter) > Date.parse(before.notAfter)) return true
  // Same expiry: the server only clears the error and moves the attempt time
  // when it confirmed a run, so that counts as an answer for a kept certificate.
  return attemptAdvanced(row, before) && !row.acmeLastError
}

export function judgeIssuance(
  rows: readonly InstanceHostnameRecord[],
  baseline: IssuanceBaseline,
  /** The wait is over: a certificate that was already there and is still valid stands. */
  final = false
): Verdict {
  const names = rows.filter((row) => row.source === 'lets-encrypt')
  const failed = names.find((row) => isNewError(row, baseline.get(row.id)))
  if (failed) {
    return {
      state: 'failed',
      message: `Let's Encrypt could not issue a certificate for ${failed.host}: ${failed.acmeLastError}. Fix the cause, then apply again.`,
    }
  }
  const waiting = names.find(
    (row) => !isNewCertificate(row, baseline.get(row.id)) && !(final && row.notAfter)
  )
  if (waiting) {
    return {
      state: 'pending',
      message: `Let's Encrypt has not confirmed a new certificate for ${waiting.host} yet. Check the Certificate column in a minute, and apply again if it stays the same.`,
    }
  }
  return { state: 'issued' }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const STOPPED = 'Stopped waiting for Let’s Encrypt.'

/** Settles with `undefined` when the window closes or the caller cancels. */
function raceWindow<T>(
  work: Promise<T>,
  ms: number,
  signal: AbortSignal | undefined
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      finish()
      resolve(undefined)
    }
    const timer = setTimeout(onAbort, Math.max(ms, 0))
    signal?.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        finish()
        resolve(value)
      },
      (err: unknown) => {
        finish()
        reject(err)
      }
    )
  })
}

export async function settleIssuance({
  rows,
  baseline,
  refetch,
  signal,
  timeoutMs = ISSUANCE_POLL_TIMEOUT_MS,
  intervalMs = ISSUANCE_POLL_INTERVAL_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
}: Readonly<{
  rows: InstanceHostnameRecord[]
  baseline: IssuanceBaseline
  refetch: () => Promise<InstanceHostnameRecord[]>
  /** Aborted when the caller goes away (unmount, navigation). */
  signal?: AbortSignal
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>): Promise<IssuanceSettled> {
  const deadline = now() + timeoutMs
  const look = async (current: InstanceHostnameRecord[]): Promise<IssuanceSettled> => {
    const verdict = judgeIssuance(current, baseline, now() >= deadline)
    if (verdict.state === 'issued') return { kind: 'issued', rows: current }
    if (verdict.state === 'failed' || now() >= deadline) {
      return { kind: 'not-issued', rows: current, error: verdict.message }
    }
    if (signal?.aborted) return { kind: 'not-issued', rows: current, error: STOPPED }
    await raceWindow(sleep(intervalMs), deadline - now(), signal)
    if (signal?.aborted) return { kind: 'not-issued', rows: current, error: STOPPED }
    try {
      const next = await raceWindow(refetch(), deadline - now(), signal)
      return look(next ?? current)
    } catch (err) {
      if (!isControlPlaneRestartError(err)) throw err
      return look(current)
    }
  }
  return look(rows)
}
