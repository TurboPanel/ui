import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, InlineNotice, MonoText } from '@/components/ui'
import { formatMinorUnits } from '@/lib/billing-display'
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
        label={kind === 'credit' ? 'Credit' : 'Debit'}
        tone={kind === 'credit' ? 'ok' : 'info'}
      />
      {line.proration ? <Badge label="Prorated" tone="muted" /> : null}
      <MonoText style={styles.previewLineAmount}>{amount}</MonoText>
    </View>
  )
}

/**
 * Stripe's numbers, verbatim — never a client-side sum. The totals ride the
 * notice; every invoice line the provider returned is listed under it with
 * its own signed amount, so the operator can check the exact credit for the
 * unused remainder of the old tier against the debit for the new one before
 * paying, rather than trusting a collapsed total.
 */
export function BillingPreviewNotice({ preview, title }: Readonly<{ preview: BillingPreview; title: string }>) {
  const currency = preview.currency
  const parts = [
    `Due now ${formatMinorUnits(preview.amountDue, currency)}`,
    `subtotal ${formatMinorUnits(preview.subtotal, currency)}`,
    `tax ${formatMinorUnits(preview.tax, currency)}`,
    `total ${formatMinorUnits(preview.total, currency)}`,
  ]
  const prorated = preview.lines.some((line) => line.proration)
  const body = prorated
    ? `${parts.join(' · ')}. Prorated for the rest of the current period — the lines below are the provider's own credit and debit entries.`
    : `${parts.join(' · ')}.`
  return (
    <>
      <InlineNotice title={title} body={body} />
      {preview.lines.length > 0 ? (
        <View
          style={styles.previewLines}
          accessibilityRole="list"
          accessibilityLabel="Invoice lines from the payment provider"
        >
          <Text style={panelStyles.detailLabel}>Invoice lines</Text>
          {keyedPreviewLines(preview.lines).map(({ key, line }) => (
            <PreviewLineRow key={key} line={line} currency={currency} />
          ))}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  previewLines: {
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
