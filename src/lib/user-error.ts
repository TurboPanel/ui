/**
 * One place that turns a thrown error into a sentence a person can act on.
 *
 * Display-time only: the raw errors keep their shape because session and
 * control-plane recovery (`control-plane-recovery.ts`, `fetch-error-detail.ts`)
 * match on them.
 */

export const CONTROL_PLANE_UNREACHABLE_COPY =
  'Could not reach the control plane. Check your connection and try again.'

export const UPDATE_ALREADY_ACTIVE_COPY = 'Another update is already in progress.'

export const ENVIRONMENT_RUNNING_COPY = 'This environment is still running. Stop it first.'

/** API error codes (the part after `HTTP <status>:`) with one fixed sentence. */
const API_ERROR_COPY: Readonly<Record<string, string>> = {
  upgrade_run_active: UPDATE_ALREADY_ACTIVE_COPY,
  environment_running: ENVIRONMENT_RUNNING_COPY,
}

/** What browsers throw when `fetch` never got an answer. */
const NETWORK_FAILURE =
  /^(failed to fetch|load failed|network request failed|networkerror|fetch failed)/i

/** True for a transport-level failure: the request never reached the control plane. */
export function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return false
  if (/HTTP \d+/.test(err.message)) return false
  return err instanceof TypeError && NETWORK_FAILURE.test(err.message.trim())
}

/** The fixed sentence for a known API error code inside the message, or null. */
export function apiErrorCopy(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  for (const [code, copy] of Object.entries(API_ERROR_COPY)) {
    if (err.message.includes(code)) return copy
  }
  return null
}

/** `err` as customer text: network failures and known codes mapped, else its message, else `fallback`. */
export function userErrorMessage(err: unknown, fallback: string): string {
  if (isNetworkFetchError(err)) return CONTROL_PLANE_UNREACHABLE_COPY
  const mapped = apiErrorCopy(err)
  if (mapped) return mapped
  if (err instanceof Error && err.message.trim()) return err.message
  return fallback
}
