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
