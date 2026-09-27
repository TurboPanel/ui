import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  CopyButton,
  MonoText,
  Select,
  TextField,
  type SelectOption,
} from '@/components/ui'
import {
  LicenseDialog,
  type LicenseDialogRequest,
} from '@/components/org/billing-license-dialog'
import {
  addServerTierState,
  describeBillingRefusal,
  refusalTierId,
  formatTierFits,
  formatTierPrice,
  parseLicenseCount,
  removableAt,
  type OrgLicenseCap,
} from '@/lib/billing-display'
import {
  hasLiveBillingSubscription,
  type BillingTier,
  type BillingTierSummary,
  type LicenseAvailability,
} from '@/lib/instance-api'
import { openHostedPage } from '@/lib/open-hosted-page'
import {
  useBillingCatalog,
  useBillingSubscription,
  useCreateBillingCheckout,
  useRestoreBillingLicenses,
} from '@/lib/queries/billing'
import { useCan } from '@/lib/query-client'
import { describeSizeFit, parseSizeOutput, sizeBandRows, tierForSize } from '@/lib/server-size'
import { spacing } from '@/lib/theme'

function tierOption(tier: BillingTier): SelectOption {
  return {
    value: tier.id,
    label: tier.label,
    detail: `fits up to ${formatTierFits(tier.entitlements)} · ${formatTierPrice(tier)}`,
  }
}

/** The org-wide cap: the subscription's totals, else what the last refusal said. */
function orgCapOf(
  licenses: OrgLicenseCap | null | undefined,
  refusal: LicenseAvailability | null
): OrgLicenseCap | null {
  if (licenses) return licenses
  if (refusal) return { available: refusal.available, unusedKeys: refusal.unusedKeys }
  return null
}

/** The dialog row for a tier: the bought row when there is one, else the bare catalogue tier. */
function buyRequest(tier: BillingTier, summary: BillingTierSummary | null): LicenseDialogRequest {
  return {
    mode: 'add',
    tier: {
      tierId: tier.id,
      label: tier.label,
      ending: summary?.ending ?? 0,
      endsAt: summary?.endsAt ?? null,
      removable: summary ? removableAt(summary) : 0,
      purchased: summary?.purchased ?? 0,
      priceCents: tier.priceCents,
      currency: tier.currency,
    },
  }
}

/** Size command + band table + an optional paste box that picks the tier. */
function SizeHelp({
  tiers,
  sizeCommand,
  onPick,
}: Readonly<{
  tiers: readonly BillingTier[]
  sizeCommand: string | null
  onPick: (tierId: string) => void
}>) {
  const [pasted, setPasted] = useState('')
  const bands = useMemo(() => sizeBandRows(tiers), [tiers])
  const size = parseSizeOutput(pasted)
  const fit = size ? tierForSize(size, tiers) : null

  return (
    <View style={styles.sizeHelp}>
      {sizeCommand ? (
        <>
          <Text style={panelStyles.muted}>Run this on the server to see its size:</Text>
          <View style={panelStyles.commandCodeBlock}>
            <MonoText selectable>{sizeCommand}</MonoText>
          </View>
          <CopyButton value={sizeCommand} label="Copy size command" copiedLabel="Copied" />
        </>
      ) : null}
      {bands.length > 0 ? (
        <View style={styles.bands} accessibilityLabel="Tier sizes">
          {bands.map((band) => (
            <Text key={band.tierId} style={panelStyles.muted}>
              {`${band.label} · ${band.cores} · ${band.memory}`}
            </Text>
          ))}
        </View>
      ) : null}
      <TextField
        label="Paste what it printed (optional)"
        value={pasted}
        onChangeText={(text) => {
          setPasted(text)
          const parsed = parseSizeOutput(text)
          const match = parsed ? tierForSize(parsed, tiers) : null
          if (match) onPick(match.id)
        }}
        placeholder="8 cores, 31.3 GiB RAM"
        accessibilityLabel="Size command output"
        hint={size ? describeSizeFit(size, fit) : 'The smallest tier whose cores and RAM both cover the server.'}
      />
    </View>
  )
}

/** First purchase: no subscription yet, so a count and the hosted checkout. */
function FirstPurchase({ orgId, tier }: Readonly<{ orgId: string; tier: BillingTier }>) {
  const checkout = useCreateBillingCheckout(orgId)
  const [countText, setCountText] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const count = parseLicenseCount(countText)

  const start = async () => {
    if (count == null) return
    setError(null)
    const outcome = await checkout.run({ tierId: tier.id, quantity: count })
    if (outcome.ok) {
      openHostedPage(outcome.value.url)
      return
    }
    setError(describeBillingRefusal(outcome.cause) ?? outcome.error)
  }

  return (
    <View style={styles.sizeHelp}>
      <TextField
        label={`${tier.label} licenses`}
        value={countText}
        onChangeText={(text) => {
          setCountText(text)
          setError(null)
        }}
        keyboardType="number-pad"
        editable={!checkout.isPending}
        accessibilityLabel={`Number of ${tier.label} licenses to buy`}
        hint={`${formatTierPrice(tier)} each. Payment is collected on a hosted checkout page; you come back to billing afterwards.`}
      />
      {count == null ? (
        <Text style={panelStyles.error}>Enter a whole number of at least 1.</Text>
      ) : null}
      <ButtonRow>
        <Button
          label="Continue to checkout"
          size="sm"
          variant="primary"
          busy={checkout.isPending}
          busyLabel="Opening checkout…"
          disabled={count == null || checkout.isPending}
          onPress={() => {
            void start()
          }}
        />
      </ButtonRow>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

/**
 * Hosted Add Server: which tier the server needs (a short size command, the
 * band table, and a paste box that picks the tier), and — for that tier —
 * whether a license is free, one ending must be restored first (free, right
 * here), or one has to be bought (right here too, for owners). The license
 * the wizard mints carries no tier; the control plane places the server by
 * its hardware, so this is guidance plus the fix, never a gate on Continue.
 */
export function AddServerTierSection({
  orgId,
  chosenTierId,
  onChooseTier,
  refusal,
  onLicenseReady,
}: Readonly<{
  orgId: string
  chosenTierId: string | null
  onChooseTier: (tierId: string | null) => void
  /** Set when the last Continue was refused `no_license_available`. */
  refusal: LicenseAvailability | null
  /** A license was restored or bought — the caller clears the refusal and retries Continue. */
  onLicenseReady: () => void
}>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const catalogQuery = useBillingCatalog(orgId)
  const subscriptionQuery = useBillingSubscription(orgId, { enabled: canOwn })
  const restore = useRestoreBillingLicenses(orgId)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [buying, setBuying] = useState<LicenseDialogRequest | null>(null)

  const tiers = useMemo(
    () =>
      (catalogQuery.data?.tiers ?? [])
        .filter((tier) => !tier.isCustom)
        .sort((a, b) => a.rank - b.rank),
    [catalogQuery.data]
  )
  const sizeCommand = catalogQuery.data?.sizeCommand?.trim() || null
  const subscription = subscriptionQuery.data
  const live = hasLiveBillingSubscription(subscription)
  const actingTierId = refusalTierId(chosenTierId, refusal)
  const actingTier = tiers.find((tier) => tier.id === actingTierId) ?? null
  const summary = subscription?.tiers.find((tier) => tier.tierId === actingTierId) ?? null
  const refusalRow = refusal?.tiers.find((tier) => tier.tierId === actingTierId) ?? null
  const state = actingTier
    ? addServerTierState(
        actingTier.label,
        summary ?? refusalRow,
        orgCapOf(subscription?.licenses, refusal)
      )
    : null

  const restoreOne = async () => {
    if (!actingTier) return
    setRestoreError(null)
    const outcome = await restore.run({ tierId: actingTier.id, count: 1 })
    if (outcome.ok) {
      onLicenseReady()
      return
    }
    setRestoreError(describeBillingRefusal(outcome.cause) ?? outcome.error)
  }

  let fix: React.ReactNode = null
  if (state?.kind === 'restore') {
    fix = (
      <ButtonRow>
        <Button
          label="Restore one"
          size="sm"
          variant="primary"
          busy={restore.isPending}
          accessibilityLabel={`Restore one ${actingTier?.label ?? ''} license that is ending`}
          onPress={() => {
            void restoreOne()
          }}
        />
      </ButtonRow>
    )
  } else if (state?.kind === 'buy' && actingTier) {
    if (!canOwn) {
      fix = (
        <Text style={panelStyles.muted}>
          Ask an organization owner to add a {actingTier.label} license.
        </Text>
      )
    } else if (live) {
      fix = (
        <ButtonRow>
          <Button
            label={`Buy ${actingTier.label} licenses`}
            size="sm"
            variant="primary"
            onPress={() => setBuying(buyRequest(actingTier, summary))}
          />
        </ButtonRow>
      )
    } else if (subscriptionQuery.isSuccess) {
      fix = <FirstPurchase orgId={orgId} tier={actingTier} />
    }
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Which tier does this server need?</Text>
      <SizeHelp
        tiers={tiers}
        sizeCommand={sizeCommand}
        onPick={(tierId) => {
          setRestoreError(null)
          onChooseTier(tierId)
        }}
      />
      <Select
        value={chosenTierId}
        options={tiers.map(tierOption)}
        placeholder="Choose a tier"
        disabled={tiers.length === 0}
        accessibilityLabel="Tier this server needs"
        onChange={(next) => {
          setRestoreError(null)
          onChooseTier(next)
        }}
      />
      {state?.kind === 'available' ? (
        <Text style={panelStyles.detailLine}>{state.message}</Text>
      ) : null}
      {state && state.kind !== 'available' ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>{state.message}</Text>
        </View>
      ) : null}
      {fix}
      {restoreError ? <Text style={panelStyles.error}>{restoreError}</Text> : null}
      <LicenseDialog
        orgId={orgId}
        request={buying}
        periodEnd={subscription?.subscription?.currentPeriodEnd ?? null}
        context={{}}
        onClose={() => setBuying(null)}
        onSucceeded={() => onLicenseReady()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  sizeHelp: {
    gap: spacing.xs,
  },
  bands: {
    gap: 2,
  },
})
