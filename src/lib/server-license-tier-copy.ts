/** Plain confirmation before applying a free license move. */
export function confirmLicenseTierMove(input: Readonly<{
  fromLabel: string | null
  toLabel: string
  free: number
}>): string {
  const from = input.fromLabel ?? 'the smallest that fits'
  return `Move this server from ${from} to ${input.toLabel}. Uses 1 of your ${input.free} free ${input.toLabel} licenses. No charge.`
}
