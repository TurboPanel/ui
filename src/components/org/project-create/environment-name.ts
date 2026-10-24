/**
 * The environment-name field on "Set up production". It shows the
 * "Organization Default" pill while the name is still the organization's
 * default.
 */

/** The "Organization Default" pill shows only while the value is the default. */
export function showsDefaultPill(
  value: string,
  customDefault: string | null,
): boolean {
  return customDefault !== null && value === customDefault
}
