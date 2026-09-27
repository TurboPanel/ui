import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, CopyButton, MonoText, Select, type SelectOption } from '@/components/ui'
import {
  addServerTierState,
  describeBillingRefusal,
  refusalTierId,
  formatTierFits,
  formatTierPrice,
} from '@/lib/billing-display'
import type { BillingTier, LicenseAvailability } from '@/lib/instance-api'
import { orgBillingHref } from '@/lib/org-navigation'
import {
  useBillingCatalog,
  useBillingSubscription,
  useRestoreBillingLicenses,
} from '@/lib/queries/billing'
import { spacing } from '@/lib/theme'

function tierOption(tier: BillingTier): SelectOption {
  return {
    value: tier.id,
    label: tier.label,
    detail: `fits up to ${formatTierFits(tier.entitlements)} · ${formatTierPrice(tier)}`,
  }
}

/**
 * Hosted Add Server: which tier the server needs, a one-liner that tells
 * you, and — for that tier — whether a license is free, one ending must be
 * restored first (free, right here), or one has to be bought. The license
 * the wizard mints carries no tier; the control plane places the server by
 * its hardware, so this is guidance plus the fix, never a gate on Continue.
 */
export function AddServerTierSection({
  orgId,
  chosenTierId,
  onChooseTier,
  refusal,
  onRestored,
}: Readonly<{
  orgId: string
  chosenTierId: string | null
  onChooseTier: (tierId: string | null) => void
  /** Set when the last Continue was refused `no_license_available`. */
  refusal: LicenseAvailability | null
  /** A license was restored — the caller clears the refusal so Continue can be retried. */
  onRestored: () => void
}>) {
  const router = useRouter()
  const catalogQuery = useBillingCatalog(orgId)
  const subscriptionQuery = useBillingSubscription(orgId)
  const restore = useRestoreBillingLicenses(orgId)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const tiers = useMemo(
    () =>
      (catalogQuery.data?.tiers ?? [])
        .filter((tier) => !tier.isCustom)
        .sort((a, b) => a.rank - b.rank),
    [catalogQuery.data]
  )
  const sizeCommand = catalogQuery.data?.sizeCommand?.trim() || null
  const actingTierId = refusalTierId(chosenTierId, refusal)
  const actingTier = tiers.find((tier) => tier.id === actingTierId) ?? null
  const summary =
    subscriptionQuery.data?.tiers.find((tier) => tier.tierId === actingTierId) ??
    refusal?.tiers.find((tier) => tier.tierId === actingTierId) ??
    null
  const state = actingTier ? addServerTierState(actingTier.label, summary) : null

  const restoreOne = async () => {
    if (!actingTier) return
    setRestoreError(null)
    const outcome = await restore.run({ tierId: actingTier.id, count: 1 })
    if (outcome.ok) {
      onRestored()
      return
    }
    setRestoreError(describeBillingRefusal(outcome.cause) ?? outcome.error)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Which tier does this server need?</Text>
      {sizeCommand ? (
        <>
          <Text style={panelStyles.muted}>
            Run this on the server to see which tier it needs:
          </Text>
          <View style={panelStyles.commandCodeBlock}>
            <MonoText selectable>{sizeCommand}</MonoText>
          </View>
          <CopyButton value={sizeCommand} label="Copy size command" copiedLabel="Copied" />
        </>
      ) : null}
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
      {state && state.kind !== 'available' ? (
        <ButtonRow>
          {state.kind === 'restore' ? (
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
          ) : (
            <Button
              label="Buy one"
              size="sm"
              variant="primary"
              onPress={() =>
                router.push(orgBillingHref(orgId, { tier: actingTier?.label }) as Href)
              }
            />
          )}
        </ButtonRow>
      ) : null}
      {restoreError ? <Text style={panelStyles.error}>{restoreError}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
})
