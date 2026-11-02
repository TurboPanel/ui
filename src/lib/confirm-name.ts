/**
 * Typed-name confirmation for deletes. The control plane asks for
 * `?confirmName=<exact name>` on the deletes that remove the most (servers,
 * projects, environments, managed databases, Hosting Accounts) and answers 400
 * `confirm_name_required` otherwise; the web interface asks for the name on
 * every delete of a named thing.
 */

/** The error code of a delete the control plane refused for a missing or wrong name. */
export const CONFIRM_NAME_REQUIRED_ERROR = 'confirm_name_required'

/**
 * The name to type: the first candidate that is not blank, trimmed. Mirrors the
 * control plane, so pass the same fallbacks it uses (a server: name, hostname,
 * id; a project or environment: name, id).
 */
export function confirmationName(...candidates: ReadonlyArray<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim() ?? ''
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** The typed text counts only when it is exactly the name, so a paste works and a near miss does not. */
export function typedNameMatches(typed: string, name: string): boolean {
  return name.length > 0 && typed === name
}

/** `?confirmName=…` for a delete URL, or '' when no name is given. */
export function confirmNameQuery(confirmName: string | undefined): string {
  return confirmName === undefined ? '' : `?${new URLSearchParams({ confirmName }).toString()}`
}
