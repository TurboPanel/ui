import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  type BadgeTone,
  Button,
  ButtonRow,
  InlineNotice,
  ModalSheet,
  MonoText,
  SectionPanel,
} from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import type { BillingTier, ServerDetailRecord, TierNoticeState } from '@/lib/instance-api'
import { orgBillingHref } from '@/lib/org-navigation'
import { useBillingCatalog } from '@/lib/queries/billing'
import { useSetServerLicenseTier } from '@/lib/queries/servers'
import { confirmLicenseTierMove } from '@/lib/server-license-tier-copy'
import { licenseLine } from '@/lib/tier-shortfall-copy'
import {
  describeUnwatchedDevices,
  isTierShortfall,
  tierPlacementState,
  tierRankResolver,
  type TierPlacementState,
} from '@/lib/tier-placement'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function tierBadgeTone(state: TierPlacementState): BadgeTone {
  switch (state) {
    case 'unlicensed':
    case 'below-required':
      return 'danger'
    case 'below-recommended':
      return 'pending'
    case 'above-hardware':
      return 'info'
    case 'ok':
      return 'ok'
    default:
      return 'muted'
  }
}

function joinNamed(label: string, names: readonly string[]): string | null {
  if (names.length === 0) return null
  return `${label}: ${names.join(', ')}`
}

function describeTierNotice(notice: TierNoticeState): string {
  const reason =
    notice.kind === 'exceeds'
      ? 'org owners are emailed daily while this host exceeds its tier'
      : 'org owners are emailed daily while this tier sits above what the host needs'
  return `${reason} · last sent ${formatRelativeLocalDateTime(notice.lastNotifiedAt)}`
}

function freeAtTier(
  placement: ServerDetailRecord['tierPlacement'],
  tierId: string
): number {
  const row = placement?.tiersFree?.find((entry) => entry.tierId === tierId)
  return row?.free ?? 0
}

function eligibleTiers(
  tiers: readonly BillingTier[],
  requiredLabel: string,
  rankOf: (label: string | null | undefined) => number | null
): BillingTier[] {
  const need = rankOf(requiredLabel)
  if (need == null) return [...tiers].sort((a, b) => a.rank - b.rank)
  return tiers.filter((tier) => tier.rank >= need).sort((a, b) => a.rank - b.rank)
}

type PendingPick = Readonly<{ tier: BillingTier; free: number }>

function LicenseTierPickRow({
  orgId,
  tier,
  free,
  pickedLabel,
  busy,
  onPick,
}: Readonly<{
  orgId: string
  tier: BillingTier
  free: number
  pickedLabel: string | null
  busy: boolean
  onPick: (pick: PendingPick) => void
}>) {
  const router = useRouter()
  const isCurrent = pickedLabel === tier.label
  return (
    <View style={styles.pickRow}>
      <Text style={styles.pickLabel}>{tier.label}</Text>
      <Text style={panelStyles.muted}>{free > 0 ? `${free} free` : 'None free'}</Text>
      {free > 0 ? (
        <Button
          label={isCurrent ? 'Current pick' : 'Use'}
          variant={isCurrent ? 'secondary' : 'primary'}
          size="sm"
          disabled={isCurrent || busy}
          onPress={() => onPick({ tier, free })}
        />
      ) : (
        <Button
          label="Buy one"
          variant="secondary"
          size="sm"
          onPress={() => router.push(orgBillingHref(orgId, { tier: tier.label }))}
        />
      )}
    </View>
  )
}

function LicenseTierPickList({
  orgId,
  placement,
  choices,
  busy,
  onPick,
  onClear,
  hasPick,
}: Readonly<{
  orgId: string
  placement: NonNullable<ServerDetailRecord['tierPlacement']>
  choices: readonly BillingTier[]
  busy: boolean
  onPick: (pick: PendingPick) => void
  onClear: () => void
  hasPick: boolean
}>) {
  return (
    <View style={styles.pickList}>
      <Text style={panelStyles.detailLabel}>Put this server on</Text>
      {choices.map((tier) => (
        <LicenseTierPickRow
          key={tier.id}
          orgId={orgId}
          tier={tier}
          free={freeAtTier(placement, tier.id)}
          pickedLabel={placement.pickedTier}
          busy={busy}
          onPick={onPick}
        />
      ))}
      <Button
        label="Use the smallest that fits"
        variant="ghost"
        size="sm"
        disabled={!hasPick || busy}
        onPress={onClear}
      />
    </View>
  )
}

/**
 * Server overview: license tier the control plane assigned, optional owner
 * pick onto a spare license, and hardware context (required / recommended).
 */
export function ServerTierPlacementPanel({
  orgId,
  server,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
}>) {
  const { billingEnabled } = useAuth()
  const catalogQuery = useBillingCatalog(orgId, { enabled: billingEnabled })
  const setTier = useSetServerLicenseTier(orgId, server.id)
  const [pending, setPending] = useState<PendingPick | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rankOf = useMemo(() => tierRankResolver(catalogQuery.data?.tiers), [catalogQuery.data])
  const placement = server.tierPlacement
  if (!placement || (!billingEnabled && !placement.licenseTier)) return null

  const state = tierPlacementState(placement, rankOf)
  const notice = placement.notice ?? null
  const unwatched = describeUnwatchedDevices(placement.unwatched)
  const unwatchedLines = [
    joinNamed('Drives', unwatched.drives),
    joinNamed('NICs', unwatched.nics),
    joinNamed('GPUs', unwatched.gpus),
  ].filter((line): line is string => line != null)
  const shortfall = isTierShortfall(state)
  const tiers = catalogQuery.data?.tiers ?? []
  const choices = billingEnabled ? eligibleTiers(tiers, placement.requiredTier, rankOf) : []

  const applyPick = async (tierId: string | null) => {
    setError(null)
    const outcome = await setTier.run(tierId)
    if (!outcome.ok) {
      setError(userErrorMessage(outcome.error, 'Could not update license tier'))
      return
    }
    setPending(null)
  }

  return (
    <>
      <SectionPanel
        title="License tier"
        hint={`Required ${placement.requiredTier} · recommended ${placement.recommendedTier}`}
        headerRight={
          <View style={styles.badges}>
            {notice ? (
              <Badge
                label="Daily notice"
                tone={notice.kind === 'exceeds' ? 'pending' : 'info'}
              />
            ) : null}
            <Badge label={placement.licenseTier ?? 'Not covered'} tone={tierBadgeTone(state)} />
          </View>
        }
      >
        <View style={styles.lines}>
          <Text style={panelStyles.detailLine}>
            <Text style={panelStyles.detailLabel}>On: </Text>
            {licenseLine(placement)}
          </Text>
          {placement.pickedTier ? (
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Picked: </Text>
              {placement.pickedTier}
            </Text>
          ) : null}
          {placement.tierPickNotice ? (
            <InlineNotice tone="warning" title={placement.tierPickNotice} />
          ) : null}
          {notice ? (
            <Text style={panelStyles.detailLine} accessibilityLabel={`Daily notice: ${describeTierNotice(notice)}`}>
              <Text style={panelStyles.detailLabel}>Daily notice: </Text>
              {describeTierNotice(notice)}
            </Text>
          ) : null}
        </View>

        {billingEnabled && choices.length > 0 ? (
          <LicenseTierPickList
            orgId={orgId}
            placement={placement}
            choices={choices}
            busy={setTier.isPending}
            hasPick={placement.pickedTier != null}
            onPick={setPending}
            onClear={() => void applyPick(null)}
          />
        ) : null}

        {error ? <InlineNotice tone="warning" title={error} /> : null}

        {shortfall && unwatchedLines.length > 0 ? (
          <View style={styles.unwatched}>
            <Text style={panelStyles.detailLabel}>Not monitored</Text>
            {unwatchedLines.map((line) => (
              <MonoText key={line}>{line}</MonoText>
            ))}
          </View>
        ) : null}

        {state === 'above-hardware' ? (
          <InlineNotice
            title={`${placement.licenseTier} is well above what this host needs`}
            body={`${placement.recommendedTier} would cover every discovered device. You can pick a lower tier on this page when a license is free, or change billed quantities on Billing.`}
          />
        ) : null}
      </SectionPanel>

      <ModalSheet
        visible={pending != null}
        title="Confirm license tier"
        onRequestClose={() => setPending(null)}
      >
        {pending ? (
          <View style={styles.confirmBody}>
            <Text style={panelStyles.detailLine}>
              {confirmLicenseTierMove({
                fromLabel: placement.licenseTier,
                toLabel: pending.tier.label,
                free: pending.free,
              })}
            </Text>
            <ButtonRow>
              <Button label="Cancel" variant="secondary" onPress={() => setPending(null)} />
              <Button
                label="Apply"
                variant="primary"
                disabled={setTier.isPending}
                onPress={() => void applyPick(pending.tier.id)}
              />
            </ButtonRow>
          </View>
        ) : null}
      </ModalSheet>
    </>
  )
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lines: {
    gap: spacing.xs,
  },
  unwatched: {
    gap: spacing.xs,
  },
  pickList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickLabel: {
    minWidth: 40,
    fontWeight: '600',
  },
  confirmBody: {
    gap: spacing.md,
  },
})
