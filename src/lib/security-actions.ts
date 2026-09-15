/**
 * Outcome handling shared by every mutation on the account security screen.
 *
 * These routes are step-up protected: a session older than the re-auth window
 * is answered **403** until the operator re-types their password. The global
 * forbidden seam swallows that status (`error: null`) because for every other
 * surface a 403 means "your session changed" — here it means "ask again", so
 * the screen has to recognise the null and say so rather than fail silently.
 *
 * Structurally typed against `ApiMutationResult` rather than importing it, so
 * this module stays free of the query/transport graph.
 */

export const STEP_UP_REQUIRED_NOTE =
  'For security, confirm your password to continue.'

export type SecurityActionResult =
  | { ok: true }
  | { ok: false; error: string | null }

export type SecurityActionOutcome =
  | { kind: 'ok' }
  | { kind: 'step-up'; message: string }
  | { kind: 'error'; message: string }

export function resolveSecurityAction(
  result: SecurityActionResult,
): SecurityActionOutcome {
  if (result.ok) return { kind: 'ok' }
  if (result.error === null) {
    return { kind: 'step-up', message: STEP_UP_REQUIRED_NOTE }
  }
  return { kind: 'error', message: result.error }
}

/** The message to render, or `null` when the action succeeded. */
export function securityActionMessage(
  result: SecurityActionResult,
): string | null {
  const outcome = resolveSecurityAction(result)
  return outcome.kind === 'ok' ? null : outcome.message
}

/** Whether the password field should be revealed after this outcome. */
export function securityActionNeedsPassword(
  result: SecurityActionResult,
): boolean {
  return resolveSecurityAction(result).kind === 'step-up'
}

/** Omit an empty password so the request body stays `{}` rather than `{ password: '' }`. */
export function optionalPassword(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
