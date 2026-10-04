/** Preserve HTTP status in client fetch errors for session recovery (`isForbiddenError`). */
export function formatFetchFailureDetail(
  status: number,
  bodyError?: string,
): string {
  const statusLabel = `HTTP ${status}`
  return bodyError ? `${statusLabel}: ${bodyError}` : statusLabel
}

export function isHttpStatusError(err: unknown, status: number): err is Error {
  if (!(err instanceof Error)) return false
  return new RegExp(String.raw`HTTP ${String(status)}(?!\d)`).test(err.message)
}

/**
 * Codes the API answers with 403 that are not about the person's permissions
 * (the container belongs to someone else's host user). They must not look like
 * a lost session, so {@link isForbiddenError} skips them.
 */
const NON_PERMISSION_403_CODES = ['container_not_owned']

export function isForbiddenError(err: unknown): boolean {
  if (!isHttpStatusError(err, 403)) return false
  return !NON_PERMISSION_403_CODES.some((code) => err.message.includes(code))
}

export function isServerPlacementRequiredError(err: unknown): boolean {
  return (
    isHttpStatusError(err, 409) &&
    err.message.includes('server_placement_required')
  )
}

/**
 * Plain-words replacements for API error codes whose raw message reads wrong
 * (a 403 that is not a permission problem) or that need an action named.
 * The code stays in the error text, so callers can still match on it.
 */
const FRIENDLY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  site_engine_feature_missing:
    "This server's daemon is too old for the nginx+apache engine: update the server first.",
  container_not_owned:
    "This container isn't managed by TurboPanel on this server, so its logs can't be read. It is not a permission problem; refresh the page and check the container still belongs to this project.",
}

/** Codes whose friendly text goes after the server's own message (it names the site). */
const APPEND_TO_SERVER_MESSAGE = new Set(['site_engine_feature_missing'])

export function friendlyErrorMessage(code: string | undefined): string | undefined {
  return code ? FRIENDLY_ERROR_MESSAGES[code] : undefined
}

/**
 * The human text that follows an error code: the server's own message, the
 * friendly one for known codes (replacing the server's, or after it for codes
 * whose message names the site), or nothing.
 */
export function errorExplanation(code: string | undefined, message: unknown): string | undefined {
  const friendly = friendlyErrorMessage(code)
  const server =
    typeof message === 'string' && message.length > 0 && message !== code ? message : undefined
  if (!friendly) return server
  if (server && code && APPEND_TO_SERVER_MESSAGE.has(code)) return `${server} — ${friendly}`
  return friendly
}
