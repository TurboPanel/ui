import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  type BadgeTone,
  Button,
  InlineNotice,
  MonoText,
  SectionPanel,
} from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import type { ServerDetailRecord, TierNoticeState, TierPlacementRecord } from '@/lib/instance-api'
import { orgBillingHref } from '@/lib/org-navigation'
import { useBillingCatalog } from '@/lib/queries/billing'
import {
  describeUnwatchedDevices,
  isTierShortfall,
  tierPlacementState,
  tierRankResolver,
  type TierPlacementState,
} from '@/lib/tier-placement'
import { spacing } from '@/lib/theme'

function tierBadgeTone(state: TierPlacementState): BadgeTone {
  switch (state) {
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

/**
 * The daily-notice state in one sentence: what the owners are being emailed
 * about and when the last one went out. The marker is the control plane's
 * own record of the nag — it re-sends every 24 h while the host stays out of
 * tier and clears once the placement is back in line.
 */
function describeTierNotice(notice: TierNoticeState): string {
  const reason =
    notice.kind === 'exceeds'
      ? 'org owners are emailed daily while this host exceeds its license tier'
      : 'org owners are emailed daily while this license sits above what the host needs'
  return `${reason} · last sent ${formatRelativeLocalDateTime(notice.lastNotifiedAt)}`
}

type TierLabels = Pick<TierPlacementRecord, 'licenseTier' | 'requiredTier' | 'recommendedTier'>

function shortfallCopy(
  state: TierPlacementState,
  placement: TierLabels,
): Readonly<{ title: string; body: string }> {
  if (state === 'below-required') {
    return {
      title: `This host exceeds what ${placement.licenseTier} covers`,
      body: `Cores or RAM are above the ${placement.licenseTier} ceiling; ${placement.requiredTier} is the floor for this hardware.`,
    }
  }
  return {
    title: `Some devices are not monitored on ${placement.licenseTier}`,
    body: `Moving to ${placement.recommendedTier} adds slots for every monitored NIC and every discovered drive and GPU.`,
  }
}

/**
 * The warning for a license below what the hardware needs. The upgrade
 * button only exists where billing is on — self-hosted has nowhere to send
 * the operator, so `upgradeHref` is null there.
 */
function ShortfallNotice({
  state,
  placement,
  upgradeHref,
}: Readonly<{
  state: TierPlacementState
  placement: TierLabels
  upgradeHref: string | null
}>) {
  const router = useRouter()
  const copy = shortfallCopy(state, placement)
  return (
    <InlineNotice
      tone="warning"
      title={copy.title}
      body={copy.body}
      actions={
        upgradeHref ? (
          <Button
            label={`Upgrade to ${placement.recommendedTier}`}
            variant="primary"
            size="sm"
            onPress={() => router.push(upgradeHref)}
          />
        ) : undefined
      }
    />
  )
}

/**
 * Overview-tab read-out of `tierPlacement`: the bound license tier against
 * the hardware's required floor and recommendation, naming the devices that
 * go unmonitored when the license is short. The NIC half of the
 * recommendation follows the operator's monitored-NIC selection, not every
 * uplink discovered, so pinning fewer slots lowers it. Placement rides the server
 * detail record itself — no extra fetch, no polling loop of its own.
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
  const rankOf = useMemo(() => tierRankResolver(catalogQuery.data?.tiers), [catalogQuery.data])
  const placement = server.tierPlacement
  // Self-hosted has no tiers at all; an "Unlicensed" badge there would read
  // as a fault. Hosted keeps the panel for an untiered host so the operator
  // sees what the hardware would need.
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
  // Self-hosted has nowhere to send the operator, so no upgrade button there.
  const upgradeHref = billingEnabled
    ? orgBillingHref(orgId, { tier: placement.recommendedTier, license: server.licenseId })
    : null

  return (
    <SectionPanel
      title="License tier"
      hint={`Required ${placement.requiredTier} · recommended ${placement.recommendedTier}`}
      headerRight={
        <View style={styles.badges}>
          {notice ? <Badge label="Daily notice" tone={notice.kind === 'exceeds' ? 'pending' : 'info'} /> : null}
          <Badge label={placement.licenseTier ?? 'Unlicensed'} tone={tierBadgeTone(state)} />
        </View>
      }
    >
      <View style={styles.lines}>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>License tier: </Text>
          {placement.licenseTier ?? 'None bound (self-hosted or unassigned)'}
        </Text>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Required by cores and RAM: </Text>
          {placement.requiredTier}
        </Text>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Recommended for monitored NICs and discovered drives and GPUs: </Text>
          {placement.recommendedTier}
        </Text>
        {notice ? (
          <Text style={panelStyles.detailLine} accessibilityLabel={`Daily notice: ${describeTierNotice(notice)}`}>
            <Text style={panelStyles.detailLabel}>Daily notice: </Text>
            {describeTierNotice(notice)}
          </Text>
        ) : null}
      </View>

      {shortfall ? (
        <ShortfallNotice state={state} placement={placement} upgradeHref={upgradeHref} />
      ) : null}

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
          body={`${placement.recommendedTier} would cover every discovered device. A downgrade applies at the end of the billing period.`}
        />
      ) : null}
    </SectionPanel>
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
})
