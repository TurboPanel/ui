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
  server_offline: 'The server is offline. Try again when it is back.',
  server_placement_required: 'Put this storage on a server first.',
  backup_target_unsupported: 'This kind of storage cannot be backed up yet.',
  backup_not_found: 'That backup no longer exists.',
  deploy_not_cancellable: 'This deploy has already finished.',
  deploy_too_late:
    'This deploy is already switching over, so it can no longer be stopped. It will finish.',
  daemon_unavailable:
    'TurboPanel could not reach this server right now. Try again in a moment.',
  cancel_unsupported:
    "This server's TurboPanel daemon is too old to cancel deploys. Update it first.",
  lets_encrypt_not_enabled:
    'Your organization has not turned on Let\u2019s Encrypt. An owner can allow it in the Let\u2019s Encrypt settings on the TLS certificates page.',
  acme_requires_public_bind: 'Let\u2019s Encrypt needs this domain to be reachable from the internet.',
  hosting_not_http: 'Let\u2019s Encrypt only works for web domains, not raw ports.',
  hosting_has_no_hostnames: 'Add a domain name first.',
  letsencrypt_hostname_unsupported:
    'Let\u2019s Encrypt cannot issue for wildcard names, IP addresses or private names.',
  www_redirect_conflict:
    'This site lists both a name and its www version, so \u201cAlso send www to the main name\u201d cannot be turned on. Remove one of the two names, or leave the option off.',
}

export const TOO_MANY_ATTEMPTS_COPY = 'Too many attempts. Wait a minute and try again.'

/** A bare 429 or a generic rate-limit code (specific codes keep their own copy). */
const RATE_LIMITED = /HTTP 429(?::\s*(?:rate_limited|too_many_requests))?\s*$/

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
  if (RATE_LIMITED.test(err.message.trim())) return TOO_MANY_ATTEMPTS_COPY
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

export const STEP_NETWORK_FAILURE_COPY =
  'A network problem interrupted this step, so it could not finish. Try the update again.'

/** Raw transport wording from browsers, Node and Go that must not reach an Updates page. */
const RAW_NETWORK_TEXT =
  /failed to fetch|fetch failed|load failed|network request failed|networkerror|typeerror: |econn(?:refused|reset|aborted)|enotfound|etimedout|socket hang up|dial tcp|connection (?:refused|reset by peer)|i\/o timeout|context deadline exceeded|no such host/i

/**
 * A failure message a server or the daemon stored for an update step, made
 * safe to show: raw network text becomes one plain sentence, anything else is
 * kept. Null for an empty message.
 */
export function plainStepFailureMessage(message: string | null | undefined): string | null {
  const trimmed = message?.trim() ?? ''
  if (trimmed === '') return null
  return RAW_NETWORK_TEXT.test(trimmed) ? STEP_NETWORK_FAILURE_COPY : trimmed
}
