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

export function isForbiddenError(err: unknown): boolean {
  return isHttpStatusError(err, 403)
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

export function friendlyErrorMessage(code: string | undefined): string | undefined {
  return code ? FRIENDLY_ERROR_MESSAGES[code] : undefined
}
