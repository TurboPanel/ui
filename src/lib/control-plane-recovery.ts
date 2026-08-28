/**
 * Surviving the control plane restarting underneath a request.
 *
 * Applying public URLs regenerates the control-plane leaf certificate and
 * reloads Caddy — the very hop the browser is talking through. The request that
 * asked for it therefore usually dies in transit *even though the apply
 * succeeded*: Caddy, or a Cloudflare tunnel in front of it, answers `502` with
 * an HTML error page, so `apiFetch` reports a status-only
 * `/api/admin/v1/instance/public-urls/apply failed: HTTP 502`. Reload the page
 * and the change is there. Showing that as "Apply failed" is simply wrong, and
 * it is the one moment an operator most needs the panel to be calm.
 *
 * So a restart-shaped failure is not an error here: it is a cue to wait for the
 * control plane to come back and then confirm what actually landed.
 *
 * **What counts as restart-shaped.** `apiFetch` appends `: <message>` whenever
 * the control plane itself answered with a JSON error body, so a *status-only*
 * message is by construction something in the middle talking — a proxy, a
 * tunnel, or nothing at all. That distinction is what keeps a real `503`
 * ("no co-located daemon connected") from being swallowed as a restart.
 */

/** Statuses a proxy or tunnel emits while the origin behind it is restarting. */
const RESTART_STATUSES = new Set([
  408, 502, 503, 504,
  // Cloudflare origin-side failures: 521 down, 522/524 timeouts, 525/526 TLS —
  // all four are ordinary during a certificate swap on a tunnelled instance.
  520, 521, 522, 523, 524, 525, 526, 527,
])

/** `apiFetch` formats HTTP failures as `HTTP <status>[: <body error>]`. */
const STATUS_ONLY = /HTTP (\d{3})$/
const ANY_STATUS = /HTTP \d{3}/

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * True when the failure looks like the control plane going away mid-request
 * rather than answering. Transport-level rejections (`fetch` throwing
 * `TypeError: Failed to fetch` / `Network request failed`) carry no status at
 * all and count too — that is a connection dropped, which is exactly what a
 * Caddy reload with a fresh certificate does to an in-flight request.
 */
export function isControlPlaneRestartError(err: unknown): boolean {
  if (isAbortError(err)) return true
  if (!(err instanceof Error)) return false

  const statusOnly = STATUS_ONLY.exec(err.message)
  if (statusOnly) return RESTART_STATUSES.has(Number(statusOnly[1]))

  // A status with a body behind it means the control plane answered — a real
  // failure, and never something to wait out.
  return !ANY_STATUS.test(err.message)
}

/** How long to wait for the control plane before giving up on it. */
export const RECOVERY_TIMEOUT_MS = 90_000

/** Gap between probes — a Caddy reload is seconds, not minutes. */
export const RECOVERY_INTERVAL_MS = 2_000

export type ControlPlaneRecovery<T> =
  | { kind: 'recovered'; value: T }
  | { kind: 'unreachable' }

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Poll `probe` until the control plane answers again, or the window closes.
 *
 * The probe should be a real authenticated read, not a liveness ping: coming
 * back is only half the question, and the caller needs the answer to the other
 * half (did the change land?) from the same round trip.
 *
 * Anything that is not restart-shaped is rethrown rather than retried — a 403
 * belongs to the global forbidden seam, not to a loop in here.
 */
export async function waitForControlPlaneRecovery<T>({
  probe,
  timeoutMs = RECOVERY_TIMEOUT_MS,
  intervalMs = RECOVERY_INTERVAL_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
}: Readonly<{
  probe: () => Promise<T>
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>): Promise<ControlPlaneRecovery<T>> {
  const deadline = now() + timeoutMs

  // Probing immediately would just catch the listener that is already going
  // away, so the first thing this does is wait.
  await sleep(intervalMs)

  for (;;) {
    try {
      return { kind: 'recovered', value: await probe() }
    } catch (err) {
      if (!isControlPlaneRestartError(err)) throw err
      if (now() >= deadline) return { kind: 'unreachable' }
      await sleep(intervalMs)
    }
  }
}
