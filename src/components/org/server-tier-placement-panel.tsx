import { useMemo, useState, type ReactElement } from 'react'
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
import {
  useBillingCatalog,
  useDowngradeBillingTier,
  useUpgradeBillingTier,
} from '@/lib/queries/billing'
import { useSetServerLicenseTier } from '@/lib/queries/servers'
import {
  confirmClearLicenseTierPick,
  confirmLicenseTierChange,
  confirmLicenseTierMove,
  LICENSE_TIER_UNKNOWN_FLOOR_COPY,
  licenseTierTooSmallCopy,
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

/**
 * A pick onto a free license, or — when none is free at that size — a change
 * of this server's own license (`changeFrom`: the size it holds now), billed
 * as an upgrade or a period-end downgrade. Either way only this server moves.
 */
type PendingPick = Readonly<{ tier: BillingTier; free: number; changeFrom?: BillingTier }>
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
  currentTier,
  busy,
  onPick,
}: Readonly<{
  orgId: string
  tier: BillingTier
  free: number
  pickedLabel: string | null
  /** The size this server holds now, when it holds one. */
  currentTier: BillingTier | null
  busy: boolean
  onPick: (pick: PendingPick) => void
}>) {
  const router = useRouter()
  const isCurrent = pickedLabel === tier.label || currentTier?.id === tier.id
  const canChange = free === 0 && currentTier != null && currentTier.id !== tier.id
  let action: ReactElement
  if (free > 0) {
    action = (
      <Button
        label={isCurrent ? 'Current pick' : 'Use'}
        variant={isCurrent ? 'secondary' : 'primary'}
        size="sm"
        disabled={isCurrent || busy}
        onPress={() => onPick({ tier, free })}
      />
    )
  } else if (canChange) {
    action = (
      <Button
        label="Change this license"
        variant="secondary"
        size="sm"
        disabled={busy}
        onPress={() => onPick({ tier, free, changeFrom: currentTier })}
      />
    )
  } else if (isCurrent) {
    action = (
      <Button label="Current pick" variant="secondary" size="sm" disabled onPress={() => {}} />
    )
  } else {
    action = (
      <Button
        label="Buy one"
        variant="secondary"
        size="sm"
        onPress={() => router.push(orgBillingHref(orgId, { tier: tier.label }))}
      />
    )
  }
  return (
    <View style={styles.pickRow}>
      <Text style={styles.pickLabel}>{tier.label}</Text>
      <Text style={panelStyles.muted}>{free > 0 ? `${free} free` : 'None free'}</Text>
      {action}
    </View>
  )
}

function LicenseTierTooSmallRow({ tier }: Readonly<{ tier: BillingTier }>) {
  return (
    <View style={styles.pickRow}>
      <Text style={styles.pickLabel}>{tier.label}</Text>
      <Text style={panelStyles.muted}>{licenseTierTooSmallCopy(tier)}</Text>
    </View>
  )
}

function LicenseTierPickList({
  orgId,
  placement,
  choices,
  tooSmall,
  currentTier,
  busy,
  onPick,
  onClear,
  hasPick,
  requiredRankUnknown,
}: Readonly<{
  orgId: string
  placement: NonNullable<ServerDetailRecord['tierPlacement']>
  choices: readonly BillingTier[]
  tooSmall: readonly BillingTier[]
  currentTier: BillingTier | null
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
          currentTier={currentTier}
          busy={busy}
          onPick={onPick}
        />
      ))}
      {tooSmall.map((tier) => (
        <LicenseTierTooSmallRow key={tier.id} tier={tier} />
      ))}
      <Button
        label="Give back this license"
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
    return confirmClearLicenseTierPick(licenseTier ?? pickedTier ?? undefined)
  }
  const pick = pending as PendingPick
  if (pick.changeFrom) {
    return confirmLicenseTierChange({
      fromLabel: pick.changeFrom.label,
      toLabel: pick.tier.label,
      upgrade: pick.tier.rank > pick.changeFrom.rank,
    })
  }
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
  onApplyPick: (pick: PendingPick) => void
  onApplyClear: () => void
}>) {
  const isClear = pending != null && 'kind' in pending && pending.kind === 'clear'
  const pick: PendingPick | null =
    pending != null && !('kind' in pending) ? (pending as PendingPick) : null
  let sheetTitle = 'Confirm license tier'
  let sheetButton = 'Apply'
  if (isClear) {
    sheetTitle = 'Give back license'
    sheetButton = 'Give back'
  } else if (pick?.changeFrom) {
    sheetTitle = 'Change license'
    sheetButton = 'Change license'
  }
  return (
    <ModalSheet visible={pending != null} title={sheetTitle} onRequestClose={onDismiss}>
      {pending ? (
        <View style={styles.confirmBody}>
          <Text style={panelStyles.detailLine}>
            {confirmSheetCopy(pending, licenseTier, pickedTier)}
          </Text>
          <ButtonRow>
            <Button label="Cancel" variant="secondary" onPress={onDismiss} />
            <Button
              label={sheetButton}
              variant="primary"
              disabled={busy}
              onPress={() => {
                if (isClear) onApplyClear()
                else if (pick) onApplyPick(pick)
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
  tooSmall,
  currentTier,
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
  tooSmall: readonly BillingTier[]
  currentTier: BillingTier | null
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
          tooSmall={tooSmall}
          currentTier={currentTier}
          busy={busy}
          hasPick={placement.licenseTier != null || placement.pickedTier != null}
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
  const upgrade = useUpgradeBillingTier(orgId)
  const downgrade = useDowngradeBillingTier(orgId)
  const [pending, setPending] = useState<PendingLicenseTierAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rankOf = useMemo(() => tierRankResolver(catalogQuery.data?.tiers), [catalogQuery.data])
  const placement = server.tierPlacement
  // Self-hosted servers are all equal: no tier panel.
  if (!placement || !billingEnabled) return null

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
  const { choices, tooSmall, requiredRankUnknown } = eligibleTiersForPick(
    catalogTiers,
    placement.requiredTier,
    rankOf
  )
  const showPicker = hasLicenseTierPickerData(placement.tiersFree)
  const currentTier = catalogTiers.find((tier) => tier.label === placement.licenseTier) ?? null
  const busy = setTier.isPending || upgrade.isPending || downgrade.isPending

  const runPick = async (pick: PendingPick | null) => {
    if (!pick) return await setTier.run(null)
    if (!pick.changeFrom) return await setTier.run(pick.tier.id)
    const move = pick.tier.rank > pick.changeFrom.rank ? upgrade : downgrade
    return await move.run({
      fromTierId: pick.changeFrom.id,
      toTierId: pick.tier.id,
      serverId: server.id,
    })
  }

  const applyPick = async (pick: PendingPick | null) => {
    setError(null)
    const outcome = await runPick(pick)
    if (!outcome.ok) {
      setPending(null)
      setError(
        licenseTierUserErrorMessage(
          outcome.cause ?? outcome.error,
          'Could not update license tier',
        ),
      )
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
        tooSmall={tooSmall}
        currentTier={currentTier}
        requiredRankUnknown={requiredRankUnknown}
        error={error}
        busy={busy}
        onPick={setPending}
        onClear={() => setPending({ kind: 'clear' })}
      />
      <LicenseTierConfirmSheet
        pending={pending}
        licenseTier={placement.licenseTier}
        pickedTier={placement.pickedTier}
        busy={busy}
        onDismiss={() => setPending(null)}
        onApplyPick={(pick) => void applyPick(pick)}
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
