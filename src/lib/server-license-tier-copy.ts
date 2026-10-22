/** Plain confirmation before applying a free license move. */
export function confirmLicenseTierMove(input: Readonly<{
  fromLabel: string | null
  toLabel: string
  free: number
}>): string {
  const from = input.fromLabel ?? 'no license'
  return `Move this server from ${from} to ${input.toLabel}. Uses 1 of your ${input.free} free ${input.toLabel} licenses. No charge.`
}

/** Plain confirmation before giving back a server's license. Nothing else is assigned in its place. */
export function confirmClearLicenseTierPick(pickedLabel?: string): string {
  const which = pickedLabel ? `${pickedLabel} ` : ''
  return `Give back this server's ${which}license. The server stays connected with no license until you assign one, and the license is free for another server.`
}

/** Shown when the required tier label cannot be ranked but picks still start at the entry tier. */
export const LICENSE_TIER_UNKNOWN_FLOOR_COPY =
  'TurboPanel could not rank the required tier from this label. You can only pick at or above the smallest purchased tier until hardware reports a known floor.'
