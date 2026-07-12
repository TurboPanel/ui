/** Preserve HTTP status in client fetch errors for session recovery (`isForbiddenError`). */
export function formatFetchFailureDetail(
  status: number,
  bodyError?: string,
): string {
  const statusLabel = `HTTP ${status}`
  return bodyError ? `${statusLabel}: ${bodyError}` : statusLabel
}

export function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('HTTP 403')
}
