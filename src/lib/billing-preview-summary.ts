import { formatMinorUnits } from '@/lib/billing-display'
import { formatShortDate, type BillingPreview } from '@/lib/instance-api'

/**
 * Plain-language wording for a provider quote. Stripe prices a quantity
 * change as two prorated lines — a credit for the unused days on the old
 * quantity and a charge for the new quantity over the same days — which reads
 * as "why am I getting a credit?" to anyone buying one more license. The
 * screen leads with the net instead: what is bought, for which days, and what
 * is due now; the provider's own lines stay available behind a disclosure.
 */

/** One sentence under "Show calculation details". */
export const PREVIEW_DETAILS_EXPLANATION =
  'Stripe credits the unused days on your old quantity and charges the new quantity for the same days; the difference is what you pay.'

export type PreviewSummary = Readonly<{
  /** `1 × S1 for the rest of this period (Sep 27 – Oct 1): $0.63 due now`. */
  headline: string
  /** `From Oct 1: $35.00/month for 7 × S1 ($5.00 each, before tax)` — null when unknown. */
  followUp: string | null
  /** `Includes $0.05 tax.` — null when the quote carries no tax. */
  tax: string | null
  /** Whether the provider returned lines worth showing behind the disclosure. */
  hasDetails: boolean
}>

export type PurchasePreviewInput = Readonly<{
  preview: BillingPreview
  /** Licenses being added. */
  count: number
  /** Tier label, e.g. `S1`. */
  label: string
  /** When the current billing period ends (ISO); null when unknown. */
  periodEnd: string | null
  /** Catalogue price per license per month, in minor units; null when unknown. */
  unitCents?: number | null
  /** The tier's currency, used when the quote carries none. */
  currency?: string | null
  /** Licenses already bought at this tier before this change; null when unknown. */
  purchasedBefore?: number | null
  /** Clock for "the rest of this period"; defaults to now. */
  now?: Date
}>

export type MovePreviewInput = Readonly<{
  preview: BillingPreview
  fromLabel: string
  toLabel: string
  periodEnd: string | null
  now?: Date
}>

/** `(Sep 27 – Oct 1)`, or empty when the period end is unknown. */
function periodRange(periodEnd: string | null, now: Date): string {
  const end = formatShortDate(periodEnd)
  if (!end) return ''
  const start = formatShortDate(now.toISOString())
  return start && start !== end ? ` (${start} – ${end})` : ` (until ${end})`
}

/** `$0.63 due now` / `nothing due now` / `amount not available`. */
function dueNow(preview: BillingPreview, currency: string | null): string {
  const amount = preview.amountDue ?? preview.total
  if (amount == null || !Number.isFinite(amount)) return 'amount not available'
  if (amount <= 0) return 'nothing due now'
  return `${formatMinorUnits(amount, currency)} due now`
}

function taxLine(preview: BillingPreview, currency: string | null): string | null {
  if (preview.tax == null || !Number.isFinite(preview.tax) || preview.tax === 0) return null
  return `Includes ${formatMinorUnits(preview.tax, currency)} tax.`
}

/** Adding `count` licenses at one tier. */
export function summarizePurchasePreview(input: PurchasePreviewInput): PreviewSummary {
  const { preview, count, label, periodEnd } = input
  const now = input.now ?? new Date()
  const currency = preview.currency ?? input.currency ?? null
  const headline = `${count} × ${label} for the rest of this period${periodRange(periodEnd, now)}: ${dueNow(preview, currency)}`

  let followUp: string | null = null
  const end = formatShortDate(periodEnd)
  const unit = input.unitCents
  const before = input.purchasedBefore
  if (end && unit != null && Number.isFinite(unit) && before != null && Number.isFinite(before)) {
    const total = before + count
    followUp = `From ${end}: ${formatMinorUnits(unit * total, currency)}/month for ${total} × ${label} (${formatMinorUnits(unit, currency)} each, before tax).`
  }

  return { headline, followUp, tax: taxLine(preview, currency), hasDetails: preview.lines.length > 0 }
}

/** Moving one license up a tier, charged now for the rest of the period. */
export function summarizeMovePreview(input: MovePreviewInput): PreviewSummary {
  const { preview, fromLabel, toLabel, periodEnd } = input
  const now = input.now ?? new Date()
  const currency = preview.currency ?? null
  return {
    headline: `1 license from ${fromLabel} to ${toLabel} for the rest of this period${periodRange(periodEnd, now)}: ${dueNow(preview, currency)}`,
    followUp: null,
    tax: taxLine(preview, currency),
    hasDetails: preview.lines.length > 0,
  }
}

/** The notice body: follow-up then tax, or undefined when neither applies. */
export function previewSummaryBody(summary: PreviewSummary): string | undefined {
  const parts = [summary.followUp, summary.tax].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' ') : undefined
}
