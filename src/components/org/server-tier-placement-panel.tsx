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
import { useCan } from '@/lib/query-client'
import { useBillingCatalog } from '@/lib/queries/billing'
import { useSetServerLicenseTier } from '@/lib/queries/servers'
import {
  confirmClearLicenseTierPick,
  confirmLicenseTierMove,
  LICENSE_TIER_UNKNOWN_FLOOR_COPY,
} from '@/lib/server-license-tier-copy'
import {
  eligibleTiersForPick,
  hasLicenseTierPickerData,
  pickerCatalogTiers,
} from '@/lib/server-license-tier-eligible'
import { licenseLine, shortfallCopy, type TierLabels } from '@/lib/tier-shortfall-copy'
import {
  describeUnwatchedDevices,
  isTierShortfall,
  tierPlacementState,
  tierRankResolver,
  type TierPlacementState,
} from '@/lib/tier-placement'
import { spacing } from '@/lib/theme'
import { licenseTierUserErrorMessage } from '@/lib/user-error'

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

type PendingPick = Readonly<{ tier: BillingTier; free: number }>
type PendingLicenseTierAction = PendingPick | Readonly<{ kind: 'clear' }>

function ShortfallNotice({
  state,
  placement,
  billingHref,
}: Readonly<{
  state: TierPlacementState
  placement: TierLabels
  billingHref: string | null
}>) {
  const router = useRouter()
  const copy = shortfallCopy(state, placement)
  return (
    <InlineNotice
      tone="warning"
      title={copy.title}
      body={copy.body}
      actions={
        billingHref ? (
          <Button
            label={copy.cta}
            variant="primary"
            size="sm"
            onPress={() => router.push(billingHref)}
          />
        ) : undefined
      }
    />
  )
}

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
  requiredRankUnknown,
}: Readonly<{
  orgId: string
  placement: NonNullable<ServerDetailRecord['tierPlacement']>
  choices: readonly BillingTier[]
  busy: boolean
  onPick: (pick: PendingPick) => void
  onClear: () => void
  hasPick: boolean
  requiredRankUnknown: boolean
}>) {
  return (
    <View style={styles.pickList}>
      <Text style={panelStyles.detailLabel}>Put this server on</Text>
      {requiredRankUnknown ? (
        <InlineNotice tone="warning" title={LICENSE_TIER_UNKNOWN_FLOOR_COPY} />
      ) : null}
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

function confirmSheetCopy(
  pending: PendingLicenseTierAction,
  licenseTier: string | null,
  pickedTier: string | null
): string {
  if ('kind' in pending && pending.kind === 'clear') {
    return confirmClearLicenseTierPick(pickedTier)
  }
  const pick = pending as PendingPick
  return confirmLicenseTierMove({
    fromLabel: licenseTier,
    toLabel: pick.tier.label,
    free: pick.free,
  })
}

function LicenseTierConfirmSheet({
  pending,
  licenseTier,
  pickedTier,
  busy,
  onDismiss,
  onApplyPick,
  onApplyClear,
}: Readonly<{
  pending: PendingLicenseTierAction | null
  licenseTier: string | null
  pickedTier: string | null
  busy: boolean
  onDismiss: () => void
  onApplyPick: (tierId: string) => void
  onApplyClear: () => void
}>) {
  const isClear = pending != null && 'kind' in pending && pending.kind === 'clear'
  const pick: PendingPick | null =
    pending != null && !('kind' in pending) ? (pending as PendingPick) : null
  return (
    <ModalSheet
      visible={pending != null}
      title={isClear ? 'Clear license tier pick' : 'Confirm license tier'}
      onRequestClose={onDismiss}
    >
      {pending ? (
        <View style={styles.confirmBody}>
          <Text style={panelStyles.detailLine}>
            {confirmSheetCopy(pending, licenseTier, pickedTier)}
          </Text>
          <ButtonRow>
            <Button label="Cancel" variant="secondary" onPress={onDismiss} />
            <Button
              label={isClear ? 'Clear pick' : 'Apply'}
              variant="primary"
              disabled={busy}
              onPress={() => {
                if (isClear) onApplyClear()
                else if (pick) onApplyPick(pick.tier.id)
              }}
            />
          </ButtonRow>
        </View>
      ) : null}
    </ModalSheet>
  )
}

function LicenseTierPanelBody({
  orgId,
  placement,
  state,
  notice,
  unwatchedLines,
  shortfall,
  needsAttention,
  billingHref,
  billingEnabled,
  canOwn,
  showPicker,
  choices,
  requiredRankUnknown,
  error,
  busy,
  onPick,
  onClear,
}: Readonly<{
  orgId: string
  placement: NonNullable<ServerDetailRecord['tierPlacement']>
  state: TierPlacementState
  notice: TierNoticeState | null
  unwatchedLines: readonly string[]
  shortfall: boolean
  needsAttention: boolean
  billingHref: string | null
  billingEnabled: boolean
  canOwn: boolean
  showPicker: boolean
  choices: readonly BillingTier[]
  requiredRankUnknown: boolean
  error: string | null
  busy: boolean
  onPick: (pick: PendingPick) => void
  onClear: () => void
}>) {
  return (
    <SectionPanel
      title="License tier"
      hint={`Required ${placement.requiredTier} · recommended ${placement.recommendedTier}`}
      headerRight={
        <View style={styles.badges}>
          {notice ? (
            <Badge label="Daily notice" tone={notice.kind === 'exceeds' ? 'pending' : 'info'} />
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
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Required by cores and RAM: </Text>
          {placement.requiredTier}
        </Text>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Recommended for monitored NICs and discovered drives and GPUs: </Text>
          {placement.recommendedTier}
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
          <Text
            style={panelStyles.detailLine}
            accessibilityLabel={`Daily notice: ${describeTierNotice(notice)}`}
          >
            <Text style={panelStyles.detailLabel}>Daily notice: </Text>
            {describeTierNotice(notice)}
          </Text>
        ) : null}
      </View>

      {needsAttention ? (
        <ShortfallNotice state={state} placement={placement} billingHref={billingHref} />
      ) : null}

      {billingEnabled && showPicker && canOwn ? (
        <LicenseTierPickList
          orgId={orgId}
          placement={placement}
          choices={choices}
          busy={busy}
          hasPick={placement.pickedTier != null}
          requiredRankUnknown={requiredRankUnknown}
          onPick={onPick}
          onClear={onClear}
        />
      ) : null}

      {billingEnabled && showPicker && !canOwn ? (
        <Text style={panelStyles.muted}>Only organization owners can pick a license tier for this server.</Text>
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
  const canOwn = useCan('organization', orgId, 'organization:own')
  const catalogQuery = useBillingCatalog(orgId, { enabled: billingEnabled })
  const setTier = useSetServerLicenseTier(orgId, server.id)
  const [pending, setPending] = useState<PendingLicenseTierAction | null>(null)
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
  const needsAttention = shortfall || state === 'unlicensed'
  const targetTier = state === 'unlicensed' ? placement.requiredTier : placement.recommendedTier
  const billingHref = billingEnabled ? orgBillingHref(orgId, { tier: targetTier }) : null

  const catalogTiers = pickerCatalogTiers(catalogQuery.data?.tiers ?? [], placement.tiersFree, rankOf)
  const { choices, requiredRankUnknown } = eligibleTiersForPick(
    catalogTiers,
    placement.requiredTier,
    rankOf
  )
  const showPicker = hasLicenseTierPickerData(placement.tiersFree)

  const applyPick = async (tierId: string | null) => {
    setError(null)
    const outcome = await setTier.run(tierId)
    if (!outcome.ok) {
      setError(licenseTierUserErrorMessage(outcome.error, 'Could not update license tier'))
      return
    }
    setPending(null)
  }

  return (
    <>
      <LicenseTierPanelBody
        orgId={orgId}
        placement={placement}
        state={state}
        notice={notice}
        unwatchedLines={unwatchedLines}
        shortfall={shortfall}
        needsAttention={needsAttention}
        billingHref={billingHref}
        billingEnabled={billingEnabled}
        canOwn={canOwn}
        showPicker={showPicker}
        choices={choices}
        requiredRankUnknown={requiredRankUnknown}
        error={error}
        busy={setTier.isPending}
        onPick={setPending}
        onClear={() => setPending({ kind: 'clear' })}
      />
      <LicenseTierConfirmSheet
        pending={pending}
        licenseTier={placement.licenseTier}
        pickedTier={placement.pickedTier}
        busy={setTier.isPending}
        onDismiss={() => setPending(null)}
        onApplyPick={(tierId) => void applyPick(tierId)}
        onApplyClear={() => void applyPick(null)}
      />
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
