import { endingLabel } from '@/lib/billing-display'
import { formatShortDate } from '@/lib/instance-api'

/**
 * The words the Add / Remove / Restore licenses dialog shows, kept apart from
 * the component so every branch can be pinned by a test.
 */

export type LicenseDialogCopyMode = 'add' | 'remove' | 'restore'

type EndingTier = Readonly<{ label: string; ending: number; endsAt: string | null }>

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`
}

/** `on Oct 26` / `at the end of the period`. */
export function whenLabel(iso: string | null): string {
  const short = formatShortDate(iso)
  return short ? `on ${short}` : 'at the end of the period'
}

/** Title and body of the notice above a Restore. `restoreFirst`: an Add that turned into a Restore. */
export function restoreNoticeCopy(
  tier: EndingTier,
  restoreFirst: boolean
): Readonly<{ title: string; body: string }> {
  if (restoreFirst) {
    const licenses = plural(tier.ending, `${tier.label} license`, `${tier.label} licenses`)
    return {
      title: `You have ${licenses} ending ${whenLabel(tier.endsAt)}`,
      body: 'Restore those first — it is free and they stay yours past that date. Buy new licenses at this tier only once none are ending.',
    }
  }
  const endDate = formatShortDate(tier.endsAt) ?? 'the end of the period'
  return {
    title: 'Free — nothing is charged',
    body: `Restored licenses stay yours past ${endDate} and can take a new server right away.`,
  }
}

/** Title of the warning above a Remove; `count` is `null` while the count field is not a valid number. */
export function removeNoticeTitle(count: number | null, periodEnd: string | null): string {
  const what = count == null ? 'Licenses end' : plural(count, 'license ends', 'licenses end')
  return `${what} ${whenLabel(periodEnd)}`
}

/** The primary button: its label and whether it confirms the change or first asks for a price quote. */
export function primaryButtonCopy(
  mode: LicenseDialogCopyMode,
  count: number | null,
  hasQuote: boolean
): Readonly<{ label: string; action: 'confirm' | 'review' }> {
  if (mode === 'restore') return { label: `Restore ${count ?? ''}`.trim(), action: 'confirm' }
  if (mode === 'remove') return { label: `Remove ${count ?? ''}`.trim(), action: 'confirm' }
  if (hasQuote) return { label: 'Confirm and pay', action: 'confirm' }
  return { label: 'Review price', action: 'review' }
}

/** The hint under the count field. */
export function countHint(
  mode: LicenseDialogCopyMode,
  tier: EndingTier & Readonly<{ removable: number }>
): string {
  if (mode === 'restore') return `Up to ${tier.ending} (${endingLabel(tier.ending, tier.endsAt)}).`
  if (mode === 'remove')
    return `Up to ${tier.removable} — licenses covering a server cannot be removed.`
  return 'Charged now for the rest of this period, then monthly with your other licenses.'
}
