import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, InlineNotice, ModalSheet, TextField } from '@/components/ui'
import {
  describeBillingRefusal,
  endingLabel,
  parseLicenseCount,
  type RefusalContext,
} from '@/lib/billing-display'
import {
  BillingRefusalError,
  formatShortDate,
  LICENSES_ENDING_ERROR,
  type BillingPreview,
} from '@/lib/instance-api'
import type { ApiMutationResult } from '@/lib/query-client'
import {
  useChangeBillingSeats,
  usePreviewBillingChange,
  useRestoreBillingLicenses,
} from '@/lib/queries/billing'
import { spacing } from '@/lib/theme'
import { BillingPreviewNotice } from '@/components/org/billing-preview-notice'

export type LicenseDialogMode = 'add' | 'remove' | 'restore'

/** The tier row the dialog acts on — a bought tier, or a catalogue tier with nothing bought yet. */
export type LicenseDialogTier = Readonly<{
  tierId: string
  label: string
  ending: number
  endsAt: string | null
  /** Upper bound Remove offers; 0 hides nothing but refuses the count. */
  removable: number
}>

export type LicenseDialogRequest = Readonly<{ mode: LicenseDialogMode; tier: LicenseDialogTier }>

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`
}

/** `on Oct 26` / `at the end of the period`. */
function whenLabel(iso: string | null): string {
  const short = formatShortDate(iso)
  return short ? `on ${short}` : 'at the end of the period'
}

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
}: Readonly<{
  orgId: string
  request: LicenseDialogRequest | null
  periodEnd: string | null
  context: RefusalContext
  onClose: () => void
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
    />
  )
}

function LicenseDialogBody({
  orgId,
  request,
  periodEnd,
  context,
  onClose,
}: Readonly<{
  orgId: string
  request: LicenseDialogRequest
  periodEnd: string | null
  context: RefusalContext
  onClose: () => void
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

  const confirm = async () => {
    if (!validCount || count == null) return
    setError(null)
    let outcome: ApiMutationResult<unknown>
    if (mode === 'restore') {
      outcome = await restore.run({ tierId: tier.tierId, count })
    } else if (mode === 'remove') {
      outcome = await change.run({ tierId: tier.tierId, delta: -count })
    } else {
      if (!quote) return
      outcome = await change.run({
        tierId: tier.tierId,
        delta: count,
        prorationDate: quote.prorationDate,
      })
    }
    if (outcome.ok) {
      onClose()
      return
    }
    setError(failure(outcome, context))
    if (mode === 'add' && isLicensesEnding(outcome)) switchToRestore()
  }

  let consequence: React.ReactNode = null
  if (mode === 'restore') {
    consequence = (
      <InlineNotice
        title={
          restoreFirst
            ? `You have ${plural(tier.ending, `${tier.label} license`, `${tier.label} licenses`)} ending ${whenLabel(tier.endsAt)}`
            : 'Free — nothing is charged'
        }
        body={
          restoreFirst
            ? 'Restore those first — it is free and they stay yours past that date. Buy new licenses at this tier only once none are ending.'
            : `Restored licenses stay yours past ${formatShortDate(tier.endsAt) ?? 'the end of the period'} and can take a new server right away.`
        }
      />
    )
  } else if (mode === 'remove') {
    consequence = (
      <InlineNotice
        tone="warning"
        title={`${count != null ? plural(count, 'license ends', 'licenses end') : 'Licenses end'} ${whenLabel(periodEnd)}`}
        body="No refund for the rest of the period. Until then they still count as yours and can be restored; they cannot take a new server. Refused if a server would be left without a license."
      />
    )
  } else if (quote) {
    consequence = (
      <BillingPreviewNotice
        preview={quote}
        title={`Adding ${count != null ? plural(count, 'license', 'licenses') : 'licenses'} at ${tier.label}`}
      />
    )
  }

  let primaryLabel: string
  let primaryAction: () => void
  if (mode === 'restore') {
    primaryLabel = `Restore ${count ?? ''}`.trim()
    primaryAction = () => void confirm()
  } else if (mode === 'remove') {
    primaryLabel = `Remove ${count ?? ''}`.trim()
    primaryAction = () => void confirm()
  } else if (quote) {
    primaryLabel = 'Confirm and pay'
    primaryAction = () => void confirm()
  } else {
    primaryLabel = 'Review price'
    primaryAction = () => void review()
  }

  let hint: string
  if (mode === 'restore') hint = `Up to ${tier.ending} (${endingLabel(tier.ending, tier.endsAt)}).`
  else if (mode === 'remove') hint = `Up to ${tier.removable} — licenses covering a server cannot be removed.`
  else hint = 'Invoiced now, prorated for the rest of the period.'

  return (
    <ModalSheet
      visible
      title={titleFor(mode, tier.label)}
      onRequestClose={busy ? () => undefined : onClose}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label={primaryLabel}
            variant={mode === 'remove' ? 'danger' : 'primary'}
            busy={busy}
            disabled={busy || !validCount}
            onPress={primaryAction}
          />
        </ButtonRow>
      }
    >
      <View style={styles.body}>
        {consequence}
        <TextField
          label="Licenses"
          value={countText}
          onChangeText={onCountChange}
          keyboardType="number-pad"
          editable={!busy}
          accessibilityLabel={`Number of ${tier.label} licenses to ${mode}`}
          hint={hint}
        />
        {count == null ? (
          <Text style={panelStyles.error}>Enter a whole number of at least 1.</Text>
        ) : null}
        {overMax ? (
          <Text style={panelStyles.error}>{`At most ${max} here.`}</Text>
        ) : null}
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
})
