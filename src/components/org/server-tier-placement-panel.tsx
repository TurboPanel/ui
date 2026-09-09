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

/**
 * The daily-notice state in one sentence: what the owners are being emailed
 * about and when the last one went out. The marker is the control plane's
 * own record of the nag — it re-sends every 24 h while the host stays out of
 * tier and clears once the placement is back in line.
 */
function describeTierNotice(notice: TierNoticeState): string {
  const reason =
    notice.kind === 'exceeds'
      ? 'org owners are emailed daily while this host exceeds its tier'
      : 'org owners are emailed daily while this tier sits above what the host needs'
  return `${reason} · last sent ${formatRelativeLocalDateTime(notice.lastNotifiedAt)}`
}

type TierLabels = Pick<TierPlacementRecord, 'licenseTier' | 'requiredTier' | 'recommendedTier'>

type PlacementCopy = Readonly<{ title: string; body: string; cta: string }>

/**
 * What to say when the server is short: not covered at all, over the
 * hard floor, or missing slots. Every variant names the tier the billing
 * page should open on.
 */
function shortfallCopy(state: TierPlacementState, placement: TierLabels): PlacementCopy {
  if (state === 'unlicensed') {
    return {
      title: `Not covered — needs ${placement.requiredTier}`,
      body: `Nothing bought covers this server yet. Buy a license at ${placement.requiredTier} or move one up, and it is covered as soon as the change lands.`,
      cta: `Get a license at ${placement.requiredTier}`,
    }
  }
  if (state === 'below-required') {
    return {
      title: `This host exceeds what ${placement.licenseTier} covers`,
      body: `Cores or RAM are above the ${placement.licenseTier} ceiling; ${placement.requiredTier} is the floor for this hardware.`,
      cta: `Upgrade to ${placement.recommendedTier}`,
    }
  }
  return {
    title: `Some devices are not monitored on ${placement.licenseTier}`,
    body: `Moving to ${placement.recommendedTier} adds slots for every monitored NIC and every discovered drive and GPU.`,
    cta: `Upgrade to ${placement.recommendedTier}`,
  }
}

/**
 * The warning for a server below what its hardware needs. The button only
 * exists where billing is on — self-hosted has nowhere to send the
 * operator, so `billingHref` is null there. It opens the billing page on
 * the recommended tier (`?tier=`); which license moves is the billing
 * page's decision, never this panel's.
 */
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

/** `License: S3` or `Not covered — needs S5`. */
function licenseLine(placement: TierLabels): string {
  return placement.licenseTier ?? `Not covered — needs ${placement.requiredTier}`
}

/**
 * Overview-tab read-out of `tierPlacement`: the tier the control plane
 * assigned this server (from what the organization bought and the
 * hardware) against the hardware's required floor and recommendation,
 * naming the devices that go unmonitored when the tier is short. The NIC
 * half of the recommendation follows the operator's monitored-NIC
 * selection, not every uplink discovered, so pinning fewer slots lowers
 * it. Placement rides the server detail record itself — no extra fetch,
 * no polling loop of its own. The panel never assigns a tier.
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
  const needsAttention = shortfall || state === 'unlicensed'
  // An uncovered server needs the floor (what the billing page's coverage
  // notice names too); a covered-but-short one is sent to the recommendation.
  const targetTier = state === 'unlicensed' ? placement.requiredTier : placement.recommendedTier
  // Self-hosted has nowhere to send the operator, so no button there.
  const billingHref = billingEnabled ? orgBillingHref(orgId, { tier: targetTier }) : null

  return (
    <SectionPanel
      title="License"
      hint={`Required ${placement.requiredTier} · recommended ${placement.recommendedTier}`}
      headerRight={
        <View style={styles.badges}>
          {notice ? <Badge label="Daily notice" tone={notice.kind === 'exceeds' ? 'pending' : 'info'} /> : null}
          <Badge label={placement.licenseTier ?? 'Not covered'} tone={tierBadgeTone(state)} />
        </View>
      }
    >
      <View style={styles.lines}>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>License: </Text>
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
        {notice ? (
          <Text style={panelStyles.detailLine} accessibilityLabel={`Daily notice: ${describeTierNotice(notice)}`}>
            <Text style={panelStyles.detailLabel}>Daily notice: </Text>
            {describeTierNotice(notice)}
          </Text>
        ) : null}
      </View>

      {needsAttention ? (
        <ShortfallNotice state={state} placement={placement} billingHref={billingHref} />
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
          body={`${placement.recommendedTier} would cover every discovered device. Moving a license down applies at the end of the billing period.`}
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
