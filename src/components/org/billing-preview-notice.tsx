import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, InlineNotice, MonoText } from '@/components/ui'
import { formatMinorUnits } from '@/lib/billing-display'
import {
  PREVIEW_DETAILS_EXPLANATION,
  previewSummaryBody,
  type PreviewSummary,
} from '@/lib/billing-preview-summary'
import type { BillingPreview, BillingPreviewLine } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

/** A negative provider amount is a credit back to the customer; anything else is charged. */
function previewLineKind(line: BillingPreviewLine): 'credit' | 'charge' {
  return line.amount < 0 ? 'credit' : 'charge'
}

/**
 * Stripe lines carry no stable id, so each is keyed by its own content —
 * description, signed amount, proration flag — with an occurrence suffix
 * for the rare quote that repeats an identical line. The list is rebuilt
 * per quote, so the key only has to be stable within one preview.
 */
function keyedPreviewLines(
  lines: readonly BillingPreviewLine[]
): readonly Readonly<{ key: string; line: BillingPreviewLine }>[] {
  const seen = new Map<string, number>()
  return lines.map((line) => {
    const identity = `${line.description ?? ''}|${line.amount}|${line.proration ? 'prorated' : 'flat'}`
    const occurrence = seen.get(identity) ?? 0
    seen.set(identity, occurrence + 1)
    return { key: `${identity}#${occurrence}`, line }
  })
}

function PreviewLineRow({
  line,
  currency,
}: Readonly<{ line: BillingPreviewLine; currency: BillingPreview['currency'] }>) {
  const kind = previewLineKind(line)
  const description = line.description ?? 'Line item'
  const amount = formatMinorUnits(line.amount, currency)
  const proration = line.proration ? ', prorated' : ''
  return (
    <View
      style={styles.previewLine}
      accessibilityLabel={`${description}: ${kind}, ${amount}${proration}`}
    >
      <Text style={[panelStyles.detailLine, styles.previewLineDescription]} numberOfLines={2}>
        {description}
      </Text>
      <Badge
        label={kind === 'credit' ? 'Credit' : 'Charge'}
        tone={kind === 'credit' ? 'ok' : 'info'}
      />
      {line.proration ? <Badge label="Prorated" tone="muted" /> : null}
      <MonoText style={styles.previewLineAmount}>{amount}</MonoText>
    </View>
  )
}

/**
 * A provider quote in plain language: the net first (what is bought, for
 * which days, what is due now, what the monthly bill becomes), with Stripe's
 * own credit and charge lines — its numbers, verbatim, never a client-side
 * sum — behind a "Show calculation details" disclosure. Reusable wherever a
 * purchase is confirmed (billing page, Add Server). Build `summary` with
 * `summarizePurchasePreview` / `summarizeMovePreview`.
 */
export function BillingPreviewNotice({
  preview,
  summary,
}: Readonly<{ preview: BillingPreview; summary: PreviewSummary }>) {
  const [showDetails, setShowDetails] = useState(false)
  const currency = preview.currency
  return (
    <>
      <InlineNotice title={summary.headline} body={previewSummaryBody(summary)} />
      {summary.hasDetails ? (
        <View style={styles.details}>
          <Button
            label={showDetails ? 'Hide calculation details' : 'Show calculation details'}
            variant="ghost"
            size="sm"
            accessibilityLabel={
              showDetails
                ? 'Hide the payment provider calculation'
                : 'Show the payment provider calculation'
            }
            onPress={() => setShowDetails((open) => !open)}
          />
          {showDetails ? (
            <View
              style={styles.previewLines}
              accessibilityRole="list"
              accessibilityLabel="Invoice lines from the payment provider"
            >
              <Text style={panelStyles.muted}>{PREVIEW_DETAILS_EXPLANATION}</Text>
              {keyedPreviewLines(preview.lines).map(({ key, line }) => (
                <PreviewLineRow key={key} line={line} currency={currency} />
              ))}
              <View style={styles.previewLine}>
                <Text style={[panelStyles.detailLabel, styles.previewLineDescription]}>
                  Due now
                </Text>
                <MonoText style={styles.previewLineAmount}>
                  {formatMinorUnits(preview.amountDue ?? preview.total, currency)}
                </MonoText>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  details: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  previewLines: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewLineDescription: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
  },
  previewLineAmount: {
    marginLeft: 'auto',
  },
})
