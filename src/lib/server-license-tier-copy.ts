/** Plain confirmation before applying a free license move. */
export function confirmLicenseTierMove(input: Readonly<{
  fromLabel: string | null
  toLabel: string
  free: number
}>): string {
  const from = input.fromLabel ?? 'the smallest that fits'
  return `Move this server from ${from} to ${input.toLabel}. Uses 1 of your ${input.free} free ${input.toLabel} licenses. No charge.`
}

/** Plain confirmation before clearing an owner pick back to automatic placement. */
export function confirmClearLicenseTierPick(pickedLabel: string | null = null): string {
  const displayLabel = pickedLabel === null ? 'your current pick' : pickedLabel
  return `Stop pinning this server to ${displayLabel} and let TurboPanel use the smallest tier that fits again.`
}

/** Shown when the required tier label cannot be ranked but picks still start at the entry tier. */
export const LICENSE_TIER_UNKNOWN_FLOOR_COPY =
  'TurboPanel could not rank the required tier from this label. You can only pick at or above the smallest purchased tier until hardware reports a known floor.'
