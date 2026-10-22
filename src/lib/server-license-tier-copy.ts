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

const GIB = 1024 ** 3

/** Why a tier cannot be picked: its CPU or RAM limit is below this server's. */
export function licenseTierTooSmallCopy(
  tier: Readonly<{
    label: string
    entitlements: Readonly<{ maxCores: number; maxMemoryBytes: number }> | null
  }>
): string {
  if (!tier.entitlements) {
    return `This server has more CPU cores or RAM than ${tier.label} allows.`
  }
  const gib = Math.round(tier.entitlements.maxMemoryBytes / GIB)
  return `${tier.label} allows up to ${tier.entitlements.maxCores} CPU cores and ${gib} GiB of RAM. This server has more, so it cannot use ${tier.label}.`
}

/** Plain confirmation before changing this one server's license to another size. */
export function confirmLicenseTierChange(
  input: Readonly<{ fromLabel: string; toLabel: string; upgrade: boolean }>
): string {
  return input.upgrade
    ? `Change this server's ${input.fromLabel} license to ${input.toLabel}. You are billed now for the rest of this period. Only this server changes.`
    : `Change this server's ${input.fromLabel} license to ${input.toLabel} at the end of this billing period. No refund. Only this server changes.`
}
