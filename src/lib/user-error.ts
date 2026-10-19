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

export const MANAGED_HAS_BINDINGS_COPY =
  'One or more services are still connected to this cluster. Remove those connections first, then destroy it.'

/** API error codes (the part after `HTTP <status>:`) with one fixed sentence. */
const API_ERROR_COPY: Readonly<Record<string, string>> = {
  upgrade_run_active: UPDATE_ALREADY_ACTIVE_COPY,
  environment_running: ENVIRONMENT_RUNNING_COPY,
  managed_has_bindings: MANAGED_HAS_BINDINGS_COPY,
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
    'This site lists both a name and its www version as separate domains, so its www choice cannot cover them. Remove one of the two names, or set www to \u201cOnly\u201d this name.',
  tier_below_required:
    'That tier is below what this server needs. Pick a tier at or above the required floor.',
  tier_not_found: 'That tier is no longer available. Refresh and pick again.',
  server_not_licensed:
    'This server does not have an active license yet. Add the server with a license before picking a tier.',
  invalid_body: 'Choose a tier from the list, or clear the pick to use automatic placement.',
  environment_name_locked:
    "This environment's name is part of the folder path on your servers, so it cannot change while services or volumes have folders in it.",
  environment_has_folders:
    'This environment still has folders on your servers. Remove its services and volumes first, then delete it.',
  environment_server_locked:
    'This environment has folders on its server, so it cannot move to another server. Remove its services and volumes first.',
  environment_name_in_use: 'Another environment in this project already has that name.',
  directory_names_locked:
    'Folder naming is locked because folders already exist. It cannot change.',
  directory_name_taken: 'Another service or volume already uses that folder name.',
  directory_name_typed_in_uuid_mode:
    'This organization names folders by id, so a folder name cannot be typed.',
  directory_name_mode_forbidden:
    'This organization does not allow choosing that kind of folder name.',
  invalid_directory_name:
    'Use lowercase letters, digits, dots, hyphens and underscores. Start and end with a letter or digit. Up to 63 characters.',
  service_slug_locked: 'The folder name is locked because this service already has a folder.',
  storage_slug_locked: 'The folder name is locked because this volume already has a folder.',
  scope_locked: 'Whether this is shared across environments is locked once its folder exists.',
  common_asset_in_use:
    'Other environments are still using this shared item. Stop using it there first.',
  asset_not_common: 'Only items shared across environments can be used by other environments.',
  asset_in_this_environment: 'This item already belongs to this environment.',
  asset_has_no_owner: 'A shared item needs a site owner before other environments can use it.',
  machine_key_in_use: 'That server is already registered.',
}

const LICENSE_TIER_FORBIDDEN = /HTTP 403:\s*Forbidden\b/

/** `useApiMutation().run` surfaces `error` as a string; thrown values stay `Error`. */
function asErrorForCopy(err: unknown): Error | null {
  if (err instanceof Error) return err
  if (typeof err === 'string') {
    const trimmed = err.trim()
    if (trimmed) return new Error(trimmed)
  }
  return null
}

/** Maps license-tier `PUT` refusals without treating every 403 Forbidden as a tier error. */
export function licenseTierUserErrorMessage(err: unknown, fallback: string): string {
  const source = asErrorForCopy(err)
  if (LICENSE_TIER_FORBIDDEN.test(source?.message ?? '')) {
    return 'Only organization owners can change which license tier covers this server.'
  }
  return userErrorMessage(err, fallback)
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
  const source = asErrorForCopy(err)
  if (!source) return null
  if (RATE_LIMITED.test(source.message.trim())) return TOO_MANY_ATTEMPTS_COPY
  for (const [code, copy] of Object.entries(API_ERROR_COPY)) {
    if (source.message.includes(code)) return copy
  }
  return null
}

/** `err` as customer text: network failures and known codes mapped, else its message, else `fallback`. */
export function userErrorMessage(err: unknown, fallback: string): string {
  const source = asErrorForCopy(err)
  if (isNetworkFetchError(source)) return CONTROL_PLANE_UNREACHABLE_COPY
  const mapped = apiErrorCopy(err)
  if (mapped) return mapped
  const message = source?.message.trim()
  if (message) return message
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
