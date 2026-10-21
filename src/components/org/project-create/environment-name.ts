/**
 * The wizard's environment-name field. The server applies the organization's
 * real default when no name is sent, so the field only ever sends what the
 * user typed.
 */

/** Value shown in the field: the user's text, else the resolved org default, else empty. */
export function environmentFieldValue(
  edited: string | null,
  customDefault: string | null,
): string {
  return edited ?? customDefault ?? ''
}

/** The "Organization Default" pill shows only while the value is the default. */
export function showsDefaultPill(
  value: string,
  customDefault: string | null,
): boolean {
  return customDefault !== null && value === customDefault
}

/** `environmentName` for the create payload: only when the user edited it and left text. */
export function environmentNamePayload(
  edited: string | null,
): { environmentName: string } | Record<string, never> {
  const trimmed = edited?.trim()
  return trimmed ? { environmentName: trimmed } : {}
}
