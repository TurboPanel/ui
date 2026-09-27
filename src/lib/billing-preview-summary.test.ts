import { describe, expect, it } from 'vitest'
import { formatMinorUnits } from '@/lib/billing-display'
import { formatShortDate, type BillingPreview } from '@/lib/instance-api'
import {
  PREVIEW_DETAILS_EXPLANATION,
  previewSummaryBody,
  summarizeMovePreview,
  summarizePurchasePreview,
} from '@/lib/billing-preview-summary'

const NOW = new Date('2026-09-27T12:00:00Z')
const PERIOD_END = '2026-10-01T12:00:00Z'
const START = formatShortDate(NOW.toISOString())
const END = formatShortDate(PERIOD_END)
const usd = (cents: number) => formatMinorUnits(cents, 'usd')

/** The owner's quote: adding 1 × S1 to 6 — Stripe's credit and debit, net $0.63. */
function quote(overrides: Partial<BillingPreview> = {}): BillingPreview {
  return {
    prorationDate: 1_790_500_000,
    currency: 'usd',
    subtotal: 63,
    tax: 0,
    total: 63,
    amountDue: 63,
    lines: [
      { description: 'Unused time on 6 × TurboPanel S1 after 27 Sep 2026', amount: -384, proration: true },
      { description: 'Remaining time on 7 × TurboPanel S1 from 27 Sep 2026', amount: 447, proration: true },
    ],
    ...overrides,
  }
}

describe('summarizePurchasePreview', () => {
  it('leads with the net: what is bought, for which days, and what is due now', () => {
    const summary = summarizePurchasePreview({
      preview: quote(),
      count: 1,
      label: 'S1',
      periodEnd: PERIOD_END,
      unitCents: 500,
      currency: 'usd',
      purchasedBefore: 6,
      now: NOW,
    })
    expect(summary.headline).toBe(
      `1 × S1 for the rest of this period (${START} – ${END}): ${usd(63)} due now`
    )
    expect(summary.followUp).toBe(
      `From ${END}: ${usd(3500)}/month for 7 × S1 (${usd(500)} each, before tax).`
    )
    expect(summary.tax).toBeNull()
    expect(summary.hasDetails).toBe(true)
    expect(previewSummaryBody(summary)).toBe(summary.followUp)
  })

  it('mentions tax only when the quote carries some', () => {
    const summary = summarizePurchasePreview({
      preview: quote({ tax: 5, total: 68, amountDue: 68 }),
      count: 1,
      label: 'S1',
      periodEnd: PERIOD_END,
      now: NOW,
    })
    expect(summary.tax).toBe(`Includes ${usd(5)} tax.`)
    expect(summary.followUp).toBeNull()
    expect(previewSummaryBody(summary)).toBe(`Includes ${usd(5)} tax.`)
  })

  it('omits the monthly line when the price or the current quantity is unknown', () => {
    const base = { preview: quote(), count: 2, label: 'S2', periodEnd: PERIOD_END, now: NOW }
    expect(summarizePurchasePreview({ ...base, unitCents: null, purchasedBefore: 3 }).followUp).toBeNull()
    expect(summarizePurchasePreview({ ...base, unitCents: 750, purchasedBefore: null }).followUp).toBeNull()
    expect(summarizePurchasePreview({ ...base, periodEnd: null, unitCents: 750, purchasedBefore: 3 }).followUp).toBeNull()
  })

  it('drops the date range when the period end is unknown', () => {
    const summary = summarizePurchasePreview({ preview: quote(), count: 1, label: 'S1', periodEnd: null, now: NOW })
    expect(summary.headline).toBe(`1 × S1 for the rest of this period: ${usd(63)} due now`)
    expect(previewSummaryBody(summary)).toBeUndefined()
  })

  it('says "until" when the period ends today', () => {
    const summary = summarizePurchasePreview({
      preview: quote(),
      count: 1,
      label: 'S1',
      periodEnd: NOW.toISOString(),
      now: NOW,
    })
    expect(summary.headline).toBe(`1 × S1 for the rest of this period (until ${START}): ${usd(63)} due now`)
  })

  it('reads a zero or missing amount plainly', () => {
    const free = summarizePurchasePreview({
      preview: quote({ amountDue: 0, total: 0, lines: [] }),
      count: 1,
      label: 'S1',
      periodEnd: null,
      now: NOW,
    })
    expect(free.headline).toBe('1 × S1 for the rest of this period: nothing due now')
    expect(free.hasDetails).toBe(false)

    const unknown = summarizePurchasePreview({
      preview: quote({ amountDue: null, total: null }),
      count: 1,
      label: 'S1',
      periodEnd: null,
      now: NOW,
    })
    expect(unknown.headline).toBe('1 × S1 for the rest of this period: amount not available')
  })

  it('falls back to total when amountDue is absent, and to the tier currency', () => {
    const summary = summarizePurchasePreview({
      preview: quote({ amountDue: null, total: 120, currency: null }),
      count: 1,
      label: 'S3',
      periodEnd: null,
      currency: 'usd',
      now: NOW,
    })
    expect(summary.headline).toBe(`1 × S3 for the rest of this period: ${usd(120)} due now`)
  })

  it('defaults the clock to now', () => {
    const summary = summarizePurchasePreview({ preview: quote(), count: 1, label: 'S1', periodEnd: null })
    expect(summary.headline).toContain('due now')
  })
})

describe('summarizeMovePreview', () => {
  it('names the move and the net for the rest of the period', () => {
    const summary = summarizeMovePreview({
      preview: quote({ amountDue: 250, total: 250, tax: 20 }),
      fromLabel: 'S1',
      toLabel: 'S3',
      periodEnd: PERIOD_END,
      now: NOW,
    })
    expect(summary.headline).toBe(
      `1 license from S1 to S3 for the rest of this period (${START} – ${END}): ${usd(250)} due now`
    )
    expect(summary.followUp).toBeNull()
    expect(summary.tax).toBe(`Includes ${usd(20)} tax.`)
    expect(summary.hasDetails).toBe(true)
  })

  it('defaults the clock to now', () => {
    const summary = summarizeMovePreview({ preview: quote(), fromLabel: 'S1', toLabel: 'S2', periodEnd: null })
    expect(summary.headline).toBe(`1 license from S1 to S2 for the rest of this period: ${usd(63)} due now`)
  })
})

describe('PREVIEW_DETAILS_EXPLANATION', () => {
  it('explains the credit in one sentence', () => {
    expect(PREVIEW_DETAILS_EXPLANATION).toMatch(/credits the unused days/)
  })
})
