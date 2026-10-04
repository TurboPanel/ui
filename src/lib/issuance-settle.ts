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

/**
 * What each Let's Encrypt row looked like before the apply, by row id.
 * `null` means the snapshot could not be taken: nothing is then known about
 * what was there before, so the first read after the apply becomes the
 * reference and only a change seen on a later read counts.
 */
export type IssuanceBaseline = ReadonlyMap<string, RowState> | null

export function takeIssuanceBaseline(
  rows: readonly InstanceHostnameRecord[]
): ReadonlyMap<string, RowState> {
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
  /** `kept` is true when an earlier certificate stands and no new one was confirmed. */
  | { kind: 'issued'; rows: InstanceHostnameRecord[]; kept: boolean }
  | { kind: 'not-issued'; rows: InstanceHostnameRecord[]; error: string }

type Verdict =
  | { state: 'issued'; kept: boolean }
  | { state: 'failed'; message: string }
  | { state: 'pending'; message: string }

function attemptAdvanced(row: RowState, before: RowState | undefined): boolean {
  return row.acmeLastAttemptAt !== (before?.acmeLastAttemptAt ?? null)
}

function isNewError(row: RowState, before: RowState | undefined): boolean {
  if (!row.acmeLastError) return false
  return attemptAdvanced(row, before) || row.acmeLastError !== before?.acmeLastError
}

/**
 * Still valid by the server's own time: the expiry is later than the row's
 * last attempt time (a server timestamp). No attempt time, no way to check;
 * the row then has to earn trust some other way.
 */
function validAtServerTime(row: RowState, floor?: string | null): boolean {
  if (!row.notAfter) return false
  const expiry = Date.parse(row.notAfter)
  if (Number.isNaN(expiry)) return false
  const times = [row.acmeLastAttemptAt, floor]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => !Number.isNaN(value))
  return times.every((time) => expiry > time)
}

function isNewCertificate(row: RowState, before: RowState | undefined): boolean {
  if (!validAtServerTime(row)) return false
  if (!before?.notAfter) return true
  if (Date.parse(row.notAfter as string) > Date.parse(before.notAfter)) return true
  // Same expiry: the server only clears the error and moves the attempt time
  // when it confirmed a run, so that counts as an answer for a kept certificate.
  return attemptAdvanced(row, before) && !row.acmeLastError
}

/** A certificate that was already there, still valid, with nothing new said about it. */
function isKeptCertificate(row: RowState, before: RowState | undefined): boolean {
  return before !== undefined && validAtServerTime(row, before.acmeLastAttemptAt)
}

export function judgeIssuance(
  rows: readonly InstanceHostnameRecord[],
  baseline: ReadonlyMap<string, RowState>,
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
  let kept = false
  const waiting = names.find((row) => {
    const before = baseline.get(row.id)
    if (isNewCertificate(row, before)) return false
    if (final && isKeptCertificate(row, before)) {
      kept = true
      return false
    }
    return true
  })
  if (waiting) {
    return {
      state: 'pending',
      message: `Let's Encrypt has not confirmed a new certificate for ${waiting.host} yet. Check the Certificate column in a minute, and apply again if it stays the same.`,
    }
  }
  return { state: 'issued', kept }
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener('abort', finish, { once: true })
  })

const STOPPED = 'Stopped waiting for Let’s Encrypt.'

/** Settles with `undefined` when the window closes or the caller cancels. */
export function raceWindow<T>(
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
  refetch: (signal?: AbortSignal) => Promise<InstanceHostnameRecord[]>
  /** Aborted when the caller goes away (unmount, navigation). */
  signal?: AbortSignal
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}>): Promise<IssuanceSettled> {
  const deadline = now() + timeoutMs
  // Without a snapshot the first read is the reference, and an earlier
  // certificate is never taken as proof (no `final` allowance either).
  const unknown = baseline === null
  const reference = baseline ?? takeIssuanceBaseline(rows)
  const look = async (current: InstanceHostnameRecord[]): Promise<IssuanceSettled> => {
    const over = now() >= deadline
    const verdict = judgeIssuance(current, reference, over && !unknown)
    if (verdict.state === 'issued') {
      return { kind: 'issued', rows: current, kept: verdict.kept }
    }
    if (verdict.state === 'failed' || over) {
      return { kind: 'not-issued', rows: current, error: verdict.message }
    }
    if (signal?.aborted) return { kind: 'not-issued', rows: current, error: STOPPED }
    await sleep(Math.min(intervalMs, Math.max(deadline - now(), 0)), signal)
    if (signal?.aborted) return { kind: 'not-issued', rows: current, error: STOPPED }
    try {
      const next = await raceWindow(refetch(signal), deadline - now(), signal)
      return look(next ?? current)
    } catch (err) {
      if (!isControlPlaneRestartError(err)) throw err
      return look(current)
    }
  }
  return look(rows)
}
