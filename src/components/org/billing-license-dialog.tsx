import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, InlineNotice, ModalSheet, TextField } from '@/components/ui'
import {
  describeBillingRefusal,
  parseLicenseCount,
  type RefusalContext,
} from '@/lib/billing-display'
import { BillingRefusalError, LICENSES_ENDING_ERROR, type BillingPreview } from '@/lib/instance-api'
import {
  countHint,
  primaryButtonCopy,
  removeNoticeTitle,
  restoreNoticeCopy,
} from '@/lib/license-dialog-copy'
import type { ApiMutationResult } from '@/lib/query-client'
import {
  useChangeBillingSeats,
  usePreviewBillingChange,
  useRestoreBillingLicenses,
} from '@/lib/queries/billing'
import { spacing } from '@/lib/theme'
import { BillingPreviewNotice } from '@/components/org/billing-preview-notice'
import { summarizePurchasePreview } from '@/lib/billing-preview-summary'

export type LicenseDialogMode = 'add' | 'remove' | 'restore'

/** The tier row the dialog acts on — a bought tier, or a catalogue tier with nothing bought yet. */
export type LicenseDialogTier = Readonly<{
  tierId: string
  label: string
  ending: number
  endsAt: string | null
  /** Upper bound Remove offers; 0 hides nothing but refuses the count. */
  removable: number
  /** Licenses already bought at this tier — for "From Oct 1: … for N × S1". */
  purchased?: number | null
  /** Catalogue price per license per month, minor units. */
  priceCents?: number | null
  currency?: string | null
}>

export type LicenseDialogRequest = Readonly<{ mode: LicenseDialogMode; tier: LicenseDialogTier }>

function titleFor(mode: LicenseDialogMode, label: string): string {
  switch (mode) {
    case 'add':
      return `Add ${label} licenses`
    case 'remove':
      return `Remove ${label} licenses`
    case 'restore':
      return `Restore ${label} licenses`
  }
}

/** The largest count this mode accepts; `null` = no client-side ceiling (adding). */
function maxFor(mode: LicenseDialogMode, tier: LicenseDialogTier): number | null {
  if (mode === 'restore') return tier.ending
  if (mode === 'remove') return tier.removable
  return null
}

function failure(outcome: ApiMutationResult<unknown>, context: RefusalContext): string | null {
  if (outcome.ok) return null
  return describeBillingRefusal(outcome.cause, context) ?? outcome.error
}

function isLicensesEnding(outcome: ApiMutationResult<unknown>): boolean {
  return (
    !outcome.ok &&
    outcome.cause instanceof BillingRefusalError &&
    outcome.cause.code === LICENSES_ENDING_ERROR
  )
}

/**
 * Add / Remove / Restore licenses at one tier, as a blocking dialog with a
 * count. Adding is quoted by the provider before anything is charged, and is
 * never offered while licenses at that tier are ending: those must be
 * restored first (free), so nobody pays for a new license while one is
 * sitting there. Removing ends licenses at the period boundary with no
 * refund; restoring takes ending ones back, free.
 */
export function LicenseDialog({
  orgId,
  request,
  periodEnd,
  context,
  onClose,
  onSucceeded,
}: Readonly<{
  orgId: string
  request: LicenseDialogRequest | null
  periodEnd: string | null
  context: RefusalContext
  onClose: () => void
  /** Called once the add / remove / restore went through, before the dialog closes. */
  onSucceeded?: (mode: LicenseDialogMode) => void
}>) {
  // Remounting per request resets the count, quote and errors.
  if (!request) return null
  return (
    <LicenseDialogBody
      key={`${request.mode}:${request.tier.tierId}`}
      orgId={orgId}
      request={request}
      periodEnd={periodEnd}
      context={context}
      onClose={onClose}
      onSucceeded={onSucceeded}
    />
  )
}

function LicenseDialogBody({
  orgId,
  request,
  periodEnd,
  context,
  onClose,
  onSucceeded,
}: Readonly<{
  orgId: string
  request: LicenseDialogRequest
  periodEnd: string | null
  context: RefusalContext
  onClose: () => void
  onSucceeded?: (mode: LicenseDialogMode) => void
}>) {
  const { tier } = request
  // Restore before buy: an Add at a tier with licenses ending opens as a Restore.
  const [mode, setMode] = useState<LicenseDialogMode>(
    request.mode === 'add' && tier.ending > 0 ? 'restore' : request.mode
  )
  const restoreFirst = request.mode === 'add' && mode === 'restore'
  const [countText, setCountText] = useState('1')
  const [quote, setQuote] = useState<BillingPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreviewBillingChange()
  const change = useChangeBillingSeats(orgId)
  const restore = useRestoreBillingLicenses(orgId)
  const busy = preview.isPending || change.isPending || restore.isPending

  const count = parseLicenseCount(countText)
  const max = maxFor(mode, tier)
  const overMax = count != null && max != null && count > max
  const validCount = count != null && !overMax

  const onCountChange = (text: string) => {
    setCountText(text)
    setQuote(null)
    setError(null)
  }

  const switchToRestore = () => {
    setMode('restore')
    setQuote(null)
    setError(null)
    setCountText(String(Math.max(1, Math.min(count ?? 1, tier.ending))))
  }

  const review = async () => {
    if (!validCount || count == null) return
    setError(null)
    const outcome = await preview.run({ tierId: tier.tierId, delta: count })
    if (outcome.ok) {
      setQuote(outcome.value)
      return
    }
    setError(failure(outcome, context))
    // The screen's counts were stale: licenses at this tier are ending now.
    if (isLicensesEnding(outcome)) switchToRestore()
  }

  // Restore takes ending licenses back, Remove ends them, Add buys against the reviewed quote.
  const submit = (count: number): Promise<ApiMutationResult<unknown>> => {
    if (mode === 'restore') return restore.run({ tierId: tier.tierId, count })
    if (mode === 'remove') return change.run({ tierId: tier.tierId, delta: -count })
    return change.run({
      tierId: tier.tierId,
      delta: count,
      prorationDate: quote?.prorationDate,
    })
  }

  const confirm = async () => {
    if (!validCount || count == null) return
    setError(null)
    if (mode === 'add' && !quote) return
    const outcome = await submit(count)
    if (outcome.ok) {
      onSucceeded?.(mode)
      onClose()
      return
    }
    setError(failure(outcome, context))
    if (mode === 'add' && isLicensesEnding(outcome)) switchToRestore()
  }

  const primary = primaryButtonCopy(mode, count, quote != null)
  const primaryAction = () => void (primary.action === 'review' ? review() : confirm())

  return (
    <ModalSheet
      visible
      title={titleFor(mode, tier.label)}
      onRequestClose={busy ? () => undefined : onClose}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label={primary.label}
            variant={mode === 'remove' ? 'danger' : 'primary'}
            busy={busy}
            disabled={busy || !validCount}
            onPress={primaryAction}
          />
        </ButtonRow>
      }
    >
      <View style={styles.body}>
        <LicenseConsequence
          mode={mode}
          tier={tier}
          count={count}
          quote={quote}
          periodEnd={periodEnd}
          restoreFirst={restoreFirst}
        />
        <TextField
          label="Licenses"
          value={countText}
          onChangeText={onCountChange}
          keyboardType="number-pad"
          editable={!busy}
          accessibilityLabel={`Number of ${tier.label} licenses to ${mode}`}
          hint={countHint(mode, tier)}
        />
        <CountProblems count={count} max={overMax ? max : null} error={error} />
      </View>
    </ModalSheet>
  )
}

/** The notice above the count: what a Restore, Remove or reviewed Add will do. */
function LicenseConsequence({
  mode,
  tier,
  count,
  quote,
  periodEnd,
  restoreFirst,
}: Readonly<{
  mode: LicenseDialogMode
  tier: LicenseDialogTier
  count: number | null
  quote: BillingPreview | null
  periodEnd: string | null
  restoreFirst: boolean
}>) {
  if (mode === 'restore') {
    const { title, body } = restoreNoticeCopy(tier, restoreFirst)
    return <InlineNotice title={title} body={body} />
  }
  if (mode === 'remove') {
    return (
      <InlineNotice
        tone="warning"
        title={removeNoticeTitle(count, periodEnd)}
        body="No refund for the rest of the period. Until then they still count as yours and can be restored; they cannot take a new server. Refused if a server would be left without a license."
      />
    )
  }
  if (!quote || count == null) return null
  return (
    <BillingPreviewNotice
      preview={quote}
      summary={summarizePurchasePreview({
        preview: quote,
        count,
        label: tier.label,
        periodEnd,
        unitCents: tier.priceCents,
        currency: tier.currency,
        purchasedBefore: tier.purchased,
      })}
    />
  )
}

/** Inline problems under the count field; `max` is set only when the count is over it. */
function CountProblems({
  count,
  max,
  error,
}: Readonly<{ count: number | null; max: number | null; error: string | null }>) {
  return (
    <>
      {count == null ? (
        <Text style={panelStyles.error}>Enter a whole number of at least 1.</Text>
      ) : null}
      {max == null ? null : <Text style={panelStyles.error}>{`At most ${max} here.`}</Text>}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
})
