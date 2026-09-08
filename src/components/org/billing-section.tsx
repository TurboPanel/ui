import { useMemo, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { AccessNavIcon, BillingNavIcon, ServersNavIcon } from '@/components/icons/nav-icons'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  CopyButton,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableEmpty,
  DataTableRow,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  Select,
  type SelectOption,
  StatTiles,
  TextField,
} from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import {
  describePendingChange,
  formatMachineExamples,
  formatMemoryLimit,
  formatMinorUnits,
  formatTierPrice,
  formatUnlicensedNeeds,
  isDelinquentSubscription,
  machineExamplesForTier,
  pendingChangeForLicense,
  subscriptionStatusView,
  summarizeFleetTierNeeds,
  tierChangeDirection,
  totalSeats,
  type TierChangeDirection,
} from '@/lib/billing-display'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  BILLING_NOT_CONFIGURED_ERROR,
  hasLiveBillingSubscription,
  type BillingPendingChange,
  type BillingPreview,
  type BillingPreviewLine,
  type BillingSubscriptionSummary,
  type BillingTier,
  type BillingTierSeats,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { BILLING_LICENSE_QUERY_PARAM, BILLING_TIER_QUERY_PARAM } from '@/lib/org-navigation'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import type { ApiMutationResult } from '@/lib/query-client'
import {
  CHECKOUT_CONFIRM_POLL_MS,
  useBillingCatalog,
  useBillingSubscription,
  useChangeBillingSeats,
  useCreateBillingCheckout,
  useCreateBillingPortalSession,
  useDowngradeBillingLicense,
  usePreviewBillingChange,
  useUpgradeBillingLicense,
} from '@/lib/queries/billing'
import { useOrgServers } from '@/lib/queries/servers'
import { tierRankResolver } from '@/lib/tier-placement'
import { spacing } from '@/lib/theme'

/** One line an operator can paste on the host to size it against the tier ceilings. */
const SIZING_COMMAND = 'nproc && free -g'

/**
 * Stripe hands control back to `/<orgId>/billing?checkout=…` and the Portal
 * returns to the same page, so the hosted pages replace this tab on web
 * rather than opening a second one that leaves a stale console behind.
 */
function openHostedPage(url: string): void {
  if (Platform.OS === 'web' && typeof globalThis.location?.assign === 'function') {
    globalThis.location.assign(url)
    return
  }
  Linking.openURL(url).catch(() => {
    // The button's error row covers a refused open; nothing else to do here.
  })
}

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function isNotConfigured(err: unknown): boolean {
  return err instanceof Error && err.message.includes(BILLING_NOT_CONFIGURED_ERROR)
}

function formatSlots(tier: BillingTier): string {
  const { nicSlots, driveSlots, gpuSlots, filesystemSlots } = tier.entitlements
  return `${nicSlots} NIC · ${driveSlots} drive · ${gpuSlots} GPU · ${filesystemSlots} extra FS`
}

function formatFits(tier: BillingTier): string {
  return `${tier.entitlements.maxCores} cores · ${formatMemoryLimit(tier.entitlements.maxMemoryBytes)}`
}

const TIER_COLUMNS = [
  { key: 'tier', header: 'Tier', flex: 0.7, minWidth: 64 },
  { key: 'price', header: 'Per seat', flex: 1.3, minWidth: 150 },
  { key: 'fits', header: 'Fits up to', flex: 1.3, minWidth: 150 },
  { key: 'slots', header: 'Monitored slots', flex: 2, minWidth: 240 },
] as const satisfies readonly DataTableColumn[]

const [TC_TIER, TC_PRICE, TC_FITS, TC_SLOTS] = TIER_COLUMNS

/** Resolves the `?tier=` deep link — a catalogue id or a label such as `S3`. */
function findTier(tiers: readonly BillingTier[], key: string | undefined): BillingTier | null {
  if (!key) return null
  const upper = key.trim().toUpperCase()
  return tiers.find((tier) => tier.id === key || tier.label.toUpperCase() === upper) ?? null
}

function purchasableTiers(tiers: readonly BillingTier[]): BillingTier[] {
  return tiers.filter((tier) => !tier.isCustom)
}

export function BillingSection({ orgId }: Readonly<{ orgId: string }>) {
  const { billingEnabled } = useAuth()
  const params = useLocalSearchParams<{ tier?: string; license?: string; checkout?: string }>()
  const catalogQuery = useBillingCatalog(orgId, { enabled: billingEnabled })
  // Stripe redirects back before its webhook has projected the new
  // subscription, so `checkout=success` with no live subscription is a
  // "still confirming" state — polled briefly (the one poll on this page) and
  // never offered a second checkout, which would buy a second subscription.
  const [confirmDismissed, setConfirmDismissed] = useState(false)
  const returnedFromCheckout = params.checkout === 'success' && !confirmDismissed
  const subscriptionQuery = useBillingSubscription(orgId, {
    enabled: billingEnabled,
    refetchInterval: returnedFromCheckout ? CHECKOUT_CONFIRM_POLL_MS : false,
  })
  const serversQuery = useOrgServers(orgId, { enabled: billingEnabled })

  const tiers = useMemo(() => catalogQuery.data?.tiers ?? [], [catalogQuery.data])
  const servers = useMemo(() => serversQuery.data?.servers ?? [], [serversQuery.data])
  const preselectedTier = findTier(tiers, params[BILLING_TIER_QUERY_PARAM])
  const preselectedLicense = params[BILLING_LICENSE_QUERY_PARAM] ?? null
  const live = hasLiveBillingSubscription(subscriptionQuery.data)

  let body: React.ReactNode
  if (catalogQuery.isPending || subscriptionQuery.isPending) {
    body = <LoadingState label="Loading billing…" />
  } else if (returnedFromCheckout && !live && !subscriptionQuery.error) {
    body = (
      <SectionPanel
        title="Confirming payment"
        hint="Waiting for the payment provider to report the new subscription"
      >
        <LoadingState label="Confirming the checkout — this usually takes a few seconds" />
        <Text style={panelStyles.muted}>
          Seats appear here as soon as the payment is confirmed. Starting another checkout now would
          create a second subscription.
        </Text>
        <ButtonRow>
          <Button
            label="Refresh"
            size="sm"
            busy={subscriptionQuery.isFetching}
            onPress={() => {
              void subscriptionQuery.refetch()
            }}
          />
          <Button
            label="Checkout did not complete"
            size="sm"
            variant="ghost"
            onPress={() => setConfirmDismissed(true)}
          />
        </ButtonRow>
      </SectionPanel>
    )
  } else if (catalogQuery.error || subscriptionQuery.error) {
    const err = catalogQuery.error ?? subscriptionQuery.error
    body = isNotConfigured(err) ? (
      <EmptyState
        panel
        title="Billing is not available on this instance"
        hint="Self-hosted control planes have no subscription. Seats are managed by the host operator."
      />
    ) : (
      <EmptyState
        panel
        title="Could not load billing"
        hint={errorText(err, 'Unknown error')}
        action={
          <Button
            label="Retry"
            onPress={() => {
              void catalogQuery.refetch()
              void subscriptionQuery.refetch()
            }}
          />
        }
      />
    )
  } else if (!live) {
    body = (
      <CheckoutPanel
        orgId={orgId}
        tiers={tiers}
        servers={servers}
        initialTierId={preselectedTier?.id ?? null}
      />
    )
  } else {
    body = (
      <SubscriptionView
        orgId={orgId}
        summary={subscriptionQuery.data}
        tiers={tiers}
        servers={servers}
        preselectedTierId={preselectedTier?.id ?? null}
        preselectedLicenseId={preselectedLicense}
      />
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Billing</Text>
      <Text style={panelStyles.pageCopy}>
        {`Seats license servers on ${HA_PRODUCT_NAME}. One seat enrolls one host at its tier; the tier sets how many cores, RAM, and devices that host's metrics cover.`}
      </Text>
      <CheckoutReturnNotice outcome={params.checkout} live={live} />
      {body}
    </View>
  )
}

function CheckoutReturnNotice({
  outcome,
  live,
}: Readonly<{ outcome: string | undefined; live: boolean }>) {
  if (outcome === 'success') {
    // Until the projection shows the subscription, the confirming panel
    // below carries the state; a "complete" banner over it would lie.
    if (!live) return null
    return (
      <InlineNotice
        title="Checkout complete"
        body="Registration keys can now be minted against the purchased tier from Servers → Pending keys."
      />
    )
  }
  if (outcome === 'cancel') {
    return (
      <InlineNotice
        tone="warning"
        title="Checkout was cancelled"
        body="No subscription was created. Pick a tier below to try again."
      />
    )
  }
  return null
}

/**
 * What the rest of the fleet needs, from each server's control-plane
 * placement: seats to buy per tier for the unlicensed hosts, licensed hosts
 * sitting below their hardware, and hosts not yet sized. Renders nothing
 * for an empty fleet.
 */
function FleetNeedsNotice({
  tiers,
  servers,
}: Readonly<{ tiers: readonly BillingTier[]; servers: readonly OrgServerRecord[] }>) {
  const needs = useMemo(
    () => summarizeFleetTierNeeds(servers, tierRankResolver(tiers)),
    [servers, tiers]
  )
  if (needs.total === 0) return null
  const lines: string[] = []
  if (needs.unlicensed.length > 0) {
    const count = needs.unlicensed.reduce((sum, entry) => sum + entry.count, 0)
    lines.push(
      `${count} of ${needs.total} servers ${count === 1 ? 'has' : 'have'} no licence — seats to cover them: ${formatUnlicensedNeeds(needs)}.`
    )
  }
  for (const entry of needs.short) {
    lines.push(
      `${entry.name} is licensed at ${entry.licenseTier} but its hardware needs ${entry.needsTier}.`
    )
  }
  if (needs.unsized > 0) {
    lines.push(
      `${needs.unsized} ${needs.unsized === 1 ? 'server has' : 'servers have'} not reported hardware yet.`
    )
  }
  if (lines.length === 0) {
    return (
      <Text style={panelStyles.muted}>
        Every server in this organization is licensed at or above what its hardware needs.
      </Text>
    )
  }
  return (
    <InlineNotice
      tone={needs.short.length > 0 ? 'warning' : 'info'}
      title="What the rest of the fleet needs"
      body={lines.join(' ')}
    />
  )
}

// ---------------------------------------------------------------------------
// No subscription yet — tier table + sizing hint + hosted Checkout.
// ---------------------------------------------------------------------------

function TierTable({
  tiers,
  selectedTierId,
  onSelect,
}: Readonly<{
  tiers: readonly BillingTier[]
  selectedTierId: string | null
  onSelect?: (tier: BillingTier) => void
}>) {
  return (
    <DataTable columns={TIER_COLUMNS} minWidth={620} bordered>
      {tiers.length === 0 ? (
        <DataTableEmpty>No tiers are on offer right now.</DataTableEmpty>
      ) : null}
      {tiers.map((tier, index) => {
        const selectable = onSelect != null && !tier.isCustom
        const examples = formatMachineExamples(machineExamplesForTier(tier, tiers))
        return (
          <DataTableRow
            key={tier.id}
            onPress={selectable ? () => onSelect(tier) : undefined}
            selected={tier.id === selectedTierId}
            alt={index % 2 === 1}
            last={index === tiers.length - 1}
            accessibilityLabel={selectable ? `Choose tier ${tier.label}` : `Tier ${tier.label}`}
          >
            <DataTableCell column={TC_TIER}>
              <MonoText>{tier.label}</MonoText>
            </DataTableCell>
            <DataTableCell column={TC_PRICE}>
              <Text style={panelStyles.detailLine}>{formatTierPrice(tier)}</Text>
            </DataTableCell>
            <DataTableCell column={TC_FITS}>
              <Text style={panelStyles.detailLine}>{formatFits(tier)}</Text>
              {examples ? <Text style={panelStyles.muted}>{examples}</Text> : null}
            </DataTableCell>
            <DataTableCell column={TC_SLOTS}>
              <Text style={panelStyles.muted}>{formatSlots(tier)}</Text>
            </DataTableCell>
          </DataTableRow>
        )
      })}
    </DataTable>
  )
}

function parseSeatCount(raw: string): number | null {
  const value = Number(raw.trim())
  return Number.isInteger(value) && value >= 1 ? value : null
}

function CheckoutPanel({
  orgId,
  tiers,
  servers,
  initialTierId,
}: Readonly<{
  orgId: string
  tiers: readonly BillingTier[]
  servers: readonly OrgServerRecord[]
  initialTierId: string | null
}>) {
  const checkout = useCreateBillingCheckout(orgId)
  const purchasable = useMemo(() => purchasableTiers(tiers), [tiers])
  const [selectedTierId, setSelectedTierId] = useState<string | null>(initialTierId)
  const [seatsText, setSeatsText] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const selectedTier = purchasable.find((tier) => tier.id === selectedTierId) ?? null
  const seats = parseSeatCount(seatsText)

  const startCheckout = async () => {
    if (!selectedTier || seats == null) return
    setError(null)
    const outcome = await checkout.run({ tierId: selectedTier.id, quantity: seats })
    if (outcome.ok) {
      openHostedPage(outcome.value.url)
    } else if (outcome.error) {
      setError(outcome.error)
    }
  }

  return (
    <>
      <SectionPanel
        title="Choose a tier"
        hint="One seat licenses one server. Pick the smallest tier whose ceilings cover the host."
        accent
      >
        <InlineNotice
          title="Not sure which tier a host needs?"
          body="Run this on the host: the first number is its cores, the second line its RAM in GiB. Choose the lowest tier whose Fits up to column covers both."
          actions={<CopyButton value={SIZING_COMMAND} label="Copy command" />}
        />
        <MonoText style={styles.sizingCommand}>{SIZING_COMMAND}</MonoText>
        <FleetNeedsNotice tiers={tiers} servers={servers} />
        <TierTable
          tiers={tiers}
          selectedTierId={selectedTierId}
          onSelect={(tier) => setSelectedTierId(tier.id)}
        />
        {tiers.some((tier) => tier.isCustom) ? (
          <Text style={panelStyles.muted}>
            Custom tiers are negotiated — they are shown for reference and cannot be bought here.
          </Text>
        ) : null}
      </SectionPanel>

      <SectionPanel
        title="Start a subscription"
        hint="Payment is collected on a hosted checkout page"
      >
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Tier: </Text>
          {selectedTier
            ? `${selectedTier.label} · ${formatTierPrice(selectedTier)}`
            : 'Select a tier above'}
        </Text>
        <TextField
          label="Seats"
          value={seatsText}
          onChangeText={setSeatsText}
          keyboardType="number-pad"
          editable={!checkout.isPending}
          accessibilityLabel="Number of seats"
          hint="Whole number, at least 1. You can add or release seats later."
        />
        {seats == null ? (
          <Text style={panelStyles.error}>Seats must be a whole number of at least 1.</Text>
        ) : null}
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        <ButtonRow>
          <Button
            label="Continue to checkout"
            variant="primary"
            busy={checkout.isPending}
            busyLabel="Opening checkout…"
            disabled={!selectedTier || seats == null || checkout.isPending}
            onPress={() => {
              void startCheckout()
            }}
          />
        </ButtonRow>
      </SectionPanel>
    </>
  )
}

// ---------------------------------------------------------------------------
// Live subscription — status, seats per tier, license moves, portal.
// ---------------------------------------------------------------------------

function SubscriptionView({
  orgId,
  summary,
  tiers,
  servers,
  preselectedTierId,
  preselectedLicenseId,
}: Readonly<{
  orgId: string
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  servers: readonly OrgServerRecord[]
  preselectedTierId: string | null
  preselectedLicenseId: string | null
}>) {
  const pastDue = isDelinquentSubscription(summary.subscription)
  const serverNameForLicense = (licenseId: string): string | null => {
    const server = servers.find((entry) => entry.licenseId === licenseId)
    return server ? serverTitle(server) : null
  }

  return (
    <>
      {pastDue ? <PastDueNotice summary={summary} /> : null}
      <SubscriptionPanel
        summary={summary}
        tiers={tiers}
        serverNameForLicense={serverNameForLicense}
      />
      {summary.tiers.map((tierSeats) => (
        <TierSeatsPanel
          key={tierSeats.tierId}
          orgId={orgId}
          tierSeats={tierSeats}
          tier={tiers.find((tier) => tier.id === tierSeats.tierId) ?? null}
          pastDue={pastDue}
        />
      ))}
      <FleetNeedsNotice tiers={tiers} servers={servers} />
      <LicenseMovePanel
        orgId={orgId}
        summary={summary}
        tiers={tiers}
        servers={servers}
        pastDue={pastDue}
        preselectedTierId={preselectedTierId}
        preselectedLicenseId={preselectedLicenseId}
      />
    </>
  )
}

function PortalButton({
  label,
  variant = 'secondary',
}: Readonly<{ label: string; variant?: 'primary' | 'secondary' }>) {
  const portal = useCreateBillingPortalSession()
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setError(null)
    const outcome = await portal.run()
    if (outcome.ok) openHostedPage(outcome.value.url)
    else if (outcome.error) setError(outcome.error)
  }
  return (
    <View style={styles.portal}>
      <Button
        label={label}
        variant={variant}
        size="sm"
        busy={portal.isPending}
        onPress={() => {
          void open()
        }}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

function PastDueNotice({ summary }: Readonly<{ summary: BillingSubscriptionSummary }>) {
  const grace = summary.subscription?.graceExpiresAt
  return (
    <InlineNotice
      tone="warning"
      title="Payment is past due — tier changes are paused"
      body={
        grace
          ? `Monitoring continues until ${formatLocalDateTime(grace)}. Update the payment method to resume; upgrades and seat additions are refused until the balance clears.`
          : 'Update the payment method to resume; upgrades and seat additions are refused until the balance clears.'
      }
      actions={
        summary.payer ? <PortalButton label="Update payment method" variant="primary" /> : undefined
      }
    />
  )
}

function SubscriptionPanel({
  summary,
  tiers,
  serverNameForLicense,
}: Readonly<{
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  serverNameForLicense: (licenseId: string) => string | null
}>) {
  const status = subscriptionStatusView(summary.subscription?.status)
  const totals = totalSeats(summary.tiers)
  const periodEnd = summary.subscription?.currentPeriodEnd
  return (
    <SectionPanel
      title="Subscription"
      hint={
        periodEnd
          ? `Current period ends ${formatLocalDateTime(periodEnd)}`
          : 'Period end not reported yet'
      }
      headerRight={<Badge label={status.label} tone={status.tone} />}
      accent
    >
      <StatTiles
        accessibilityLabel="Seat totals"
        items={[
          {
            key: 'seats',
            icon: BillingNavIcon,
            value: totals.seats,
            label: 'SEATS',
            accessibilityLabel: `${totals.seats} seats`,
          },
          {
            key: 'used',
            icon: AccessNavIcon,
            value: totals.used,
            label: 'LICENSED',
            accessibilityLabel: `${totals.used} licensed`,
          },
          {
            key: 'free',
            icon: ServersNavIcon,
            value: totals.free,
            label: 'FREE',
            accessibilityLabel: `${totals.free} free seats`,
          },
        ]}
      />
      {summary.subscription?.pastDueSince ? (
        <Text style={panelStyles.muted}>
          Past due since {formatLocalDateTime(summary.subscription.pastDueSince)}
        </Text>
      ) : null}
      {summary.pendingChanges.length > 0 ? (
        <View style={styles.pendingList}>
          <Text style={panelStyles.detailLabel}>Pending changes</Text>
          {summary.pendingChanges.map((change) => (
            <Text key={change.id} style={panelStyles.detailLine}>
              {describePendingChange(change, tiers, serverNameForLicense)}
            </Text>
          ))}
        </View>
      ) : null}
      {summary.payer ? (
        <PortalButton label="Invoices & payment method" />
      ) : (
        <Text style={panelStyles.muted}>
          Invoices become available once the first payment is recorded.
        </Text>
      )}
    </SectionPanel>
  )
}

type SeatIntent = { delta: 1 | -1; preview: BillingPreview | null }

function TierSeatsPanel({
  orgId,
  tierSeats,
  tier,
  pastDue,
}: Readonly<{
  orgId: string
  tierSeats: BillingTierSeats
  tier: BillingTier | null
  pastDue: boolean
}>) {
  const preview = usePreviewBillingChange()
  const change = useChangeBillingSeats(orgId)
  const [intent, setIntent] = useState<SeatIntent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = preview.isPending || change.isPending

  const begin = async (delta: 1 | -1) => {
    setError(null)
    if (delta < 0) {
      // A release defers to the period boundary and is never invoiced, so
      // there is no quote to show — just the consequence.
      setIntent({ delta, preview: null })
      return
    }
    const outcome = await preview.run({ tierId: tierSeats.tierId, delta })
    if (outcome.ok) setIntent({ delta, preview: outcome.value })
    else if (outcome.error) setError(outcome.error)
  }

  const confirm = async () => {
    if (!intent) return
    setError(null)
    const outcome = await change.run({
      tierId: tierSeats.tierId,
      delta: intent.delta,
      ...(intent.preview ? { prorationDate: intent.preview.prorationDate } : {}),
    })
    if (outcome.ok) setIntent(null)
    else if (outcome.error) setError(outcome.error)
  }

  return (
    <SectionPanel
      title={`${tierSeats.label} seats`}
      hint={
        tier
          ? `${formatTierPrice(tier)} · fits up to ${formatFits(tier)}`
          : 'Tier no longer in the catalogue'
      }
    >
      <StatTiles
        accessibilityLabel={`${tierSeats.label} seat usage`}
        items={[
          {
            key: 'seats',
            icon: BillingNavIcon,
            value: tierSeats.seats,
            label: 'SEATS',
            accessibilityLabel: `${tierSeats.seats} seats`,
          },
          {
            key: 'used',
            icon: AccessNavIcon,
            value: tierSeats.licensesUsed,
            label: 'LICENSED',
            accessibilityLabel: `${tierSeats.licensesUsed} licensed`,
          },
          {
            key: 'bound',
            icon: ServersNavIcon,
            value: tierSeats.licensesBound,
            label: 'ON A SERVER',
            accessibilityLabel: `${tierSeats.licensesBound} bound to a server`,
          },
          {
            key: 'free',
            icon: BillingNavIcon,
            value: tierSeats.licensesFree,
            label: 'FREE',
            accessibilityLabel: `${tierSeats.licensesFree} free seats`,
          },
        ]}
      />
      {intent?.delta === 1 && intent.preview ? (
        <PreviewNotice preview={intent.preview} title={`Adding one ${tierSeats.label} seat`} />
      ) : null}
      {intent?.delta === -1 ? (
        <InlineNotice
          tone="warning"
          title={`Releasing one ${tierSeats.label} seat`}
          body="The seat drops at the end of the current period with no credit for the remaining time. It must not be held by an active license."
        />
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {intent ? (
        <ButtonRow>
          <Button
            label={intent.delta === 1 ? 'Confirm and pay' : 'Confirm release'}
            variant="primary"
            size="sm"
            busy={change.isPending}
            disabled={busy}
            onPress={() => {
              void confirm()
            }}
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => setIntent(null)}
          />
        </ButtonRow>
      ) : (
        <ButtonRow>
          <Button
            label="Add a seat"
            size="sm"
            busy={preview.isPending}
            disabled={busy || pastDue}
            onPress={() => {
              void begin(1)
            }}
          />
          <Button
            label="Release a seat"
            size="sm"
            variant="ghost"
            disabled={busy || tierSeats.seats === 0}
            onPress={() => {
              void begin(-1)
            }}
          />
        </ButtonRow>
      )}
      {pastDue ? (
        <Text style={panelStyles.muted}>
          Seat additions resume once the past-due balance clears.
        </Text>
      ) : null}
    </SectionPanel>
  )
}

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
function PreviewNotice({ preview, title }: Readonly<{ preview: BillingPreview; title: string }>) {
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

type MoveState =
  | { kind: 'idle' }
  | { kind: 'previewing' }
  | { kind: 'upgrade'; preview: BillingPreview }
  | { kind: 'downgrade' }

function licensedServerOptions(servers: readonly OrgServerRecord[]): SelectOption[] {
  return servers
    .filter((server) => server.licenseId != null && server.tierPlacement?.licenseTier != null)
    .map((server) => ({
      value: server.licenseId as string,
      label: serverTitle(server),
      detail: `${server.tierPlacement?.licenseTier ?? '—'} · required ${server.tierPlacement?.requiredTier ?? '—'} · recommended ${server.tierPlacement?.recommendedTier ?? '—'}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * The license the panel is working on. The operator's own pick wins once
 * made; until then the `?license=` deep link governs, but only while it
 * names a licensed server in the current options — the list usually lands
 * after the panel mounts, so this is resolved per render, not seeded.
 */
function resolveLicenseId(
  chosen: Readonly<{ value: string | null }> | null,
  preselected: string | null,
  options: readonly SelectOption[]
): string | null {
  if (chosen) return chosen.value
  return options.some((option) => option.value === preselected) ? preselected : null
}

type PlannedMove =
  | { kind: 'idle' }
  | { kind: 'downgrade' }
  | { kind: 'quote'; licenseId: string; targetTierId: string }

/**
 * What picking `next` for the selected license means. A downgrade needs no
 * quote; an upgrade is quoted by the provider first so the operator sees
 * the proration before paying. No license, no current tier, a locked seat,
 * or the same rank all leave the panel idle.
 */
function plannedMove(
  input: Readonly<{
    licenseId: string | null
    currentTier: BillingTier | null
    next: BillingTier | null
    locked: boolean
  }>
): PlannedMove {
  const { licenseId, currentTier, next, locked } = input
  if (!licenseId || !next || !currentTier || locked) return { kind: 'idle' }
  const direction = tierChangeDirection(currentTier.rank, next.rank)
  if (direction === 'downgrade') return { kind: 'downgrade' }
  if (direction === 'upgrade') return { kind: 'quote', licenseId, targetTierId: next.id }
  return { kind: 'idle' }
}

function periodEndLabel(summary: BillingSubscriptionSummary): string {
  const end = summary.subscription?.currentPeriodEnd
  return end ? formatLocalDateTime(end) : 'the period ends'
}

function failureOf(outcome: ApiMutationResult<unknown>): string | null {
  return outcome.ok ? null : outcome.error
}

function isConfirmable(
  move: MoveState
): move is Extract<MoveState, { kind: 'upgrade' | 'downgrade' }> {
  return move.kind === 'upgrade' || move.kind === 'downgrade'
}

/**
 * The move state machine: idle → (quote) → upgrade | downgrade → idle. Owns
 * the three provider calls and the last error so the panel only wires
 * pickers to it.
 */
function useLicenseMove(orgId: string) {
  const preview = usePreviewBillingChange()
  const upgrade = useUpgradeBillingLicense(orgId)
  const downgrade = useDowngradeBillingLicense(orgId)
  const [move, setMove] = useState<MoveState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  /** Back to idle; the last error stays visible until the next action. */
  const dismiss = () => setMove({ kind: 'idle' })

  const reset = () => {
    dismiss()
    setError(null)
  }

  /** Settle on what a target pick implies, quoting an upgrade first. */
  const plan = async (planned: PlannedMove) => {
    setError(null)
    if (planned.kind !== 'quote') {
      setMove(planned)
      return
    }
    setMove({ kind: 'previewing' })
    const outcome = await preview.run({
      licenseId: planned.licenseId,
      targetTierId: planned.targetTierId,
    })
    // A failed quote drops back to idle so the picker can be retried.
    setMove(outcome.ok ? { kind: 'upgrade', preview: outcome.value } : { kind: 'idle' })
    setError(failureOf(outcome))
  }

  const apply = async (licenseId: string, targetTierId: string) => {
    if (!isConfirmable(move)) return
    setError(null)
    const outcome =
      move.kind === 'upgrade'
        ? await upgrade.run({ licenseId, targetTierId, prorationDate: move.preview.prorationDate })
        : await downgrade.run({ licenseId, targetTierId })
    // A failed apply keeps the quote on screen so the operator can retry.
    if (outcome.ok) setMove({ kind: 'idle' })
    setError(failureOf(outcome))
  }

  return {
    move,
    error,
    plan,
    apply,
    dismiss,
    reset,
    busy: preview.isPending || upgrade.isPending || downgrade.isPending,
    submitting: upgrade.isPending || downgrade.isPending,
  }
}

function MoveSummary({
  server,
  currentTier,
  targetTier,
  direction,
}: Readonly<{
  server: OrgServerRecord | null
  currentTier: BillingTier | null
  targetTier: BillingTier | null
  direction: TierChangeDirection
}>) {
  if (!currentTier || !server) return null
  const arrow = targetTier && direction !== 'same' ? ` → ${targetTier.label} (${direction})` : ''
  return (
    <Text style={panelStyles.muted}>
      {serverTitle(server)} is on {currentTier.label}
      {arrow}
    </Text>
  )
}

/**
 * Everything the panel says about the move in flight: the applying spinner,
 * a pending change already on the license, the quote, the downgrade terms,
 * and the last error.
 */
function MoveFeedback({
  move,
  targetTier,
  summary,
  tiers,
  server,
  pendingForLicense,
  applying,
  error,
}: Readonly<{
  move: MoveState
  targetTier: BillingTier | null
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  server: OrgServerRecord | null
  pendingForLicense: BillingPendingChange | null
  applying: boolean
  error: string | null
}>) {
  const serverName = server ? serverTitle(server) : null
  return (
    <>
      {applying ? (
        <LoadingState label="Applying the tier change — waiting for payment confirmation" />
      ) : null}
      {pendingForLicense && !applying ? (
        <InlineNotice
          title="A change is already scheduled for this license"
          body={describePendingChange(pendingForLicense, tiers, () => serverName)}
        />
      ) : null}
      {move.kind === 'previewing' ? <LoadingState label="Fetching the quote…" /> : null}
      {move.kind === 'upgrade' && targetTier ? (
        <PreviewNotice preview={move.preview} title={`Upgrade to ${targetTier.label}`} />
      ) : null}
      {move.kind === 'downgrade' && targetTier ? (
        <InlineNotice
          tone="warning"
          title={`Downgrade to ${targetTier.label} at the end of the period`}
          body={`The license keeps its current entitlement until ${periodEndLabel(summary)}, then moves. No credit is issued for the remaining time, and devices beyond the lower tier's slots stop being monitored.`}
        />
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </>
  )
}

/**
 * The panel's buttons. "Review" only shows for a deep link (`?tier=&license=`)
 * that lands with both selects filled but no quote yet — the quote otherwise
 * fires from the picker's own change. Confirm/Cancel show once a quote or
 * downgrade is on screen.
 */
function MoveActions({
  move,
  direction,
  canReview,
  busy,
  submitting,
  confirmDisabled,
  onReview,
  onApply,
  onCancel,
}: Readonly<{
  move: MoveState
  direction: TierChangeDirection
  canReview: boolean
  busy: boolean
  submitting: boolean
  confirmDisabled: boolean
  onReview: () => void
  onApply: () => void
  onCancel: () => void
}>) {
  if (move.kind === 'idle') {
    if (!canReview) return null
    return (
      <ButtonRow>
        <Button
          label={direction === 'upgrade' ? 'Review upgrade' : 'Review downgrade'}
          variant="primary"
          disabled={busy}
          onPress={onReview}
        />
      </ButtonRow>
    )
  }
  if (move.kind === 'previewing') return null
  return (
    <ButtonRow>
      <Button
        label={move.kind === 'upgrade' ? 'Confirm upgrade and pay' : 'Schedule downgrade'}
        variant="primary"
        busy={submitting}
        disabled={confirmDisabled}
        onPress={onApply}
      />
      <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
    </ButtonRow>
  )
}

function LicenseMovePanel({
  orgId,
  summary,
  tiers,
  servers,
  pastDue,
  preselectedTierId,
  preselectedLicenseId,
}: Readonly<{
  orgId: string
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  servers: readonly OrgServerRecord[]
  pastDue: boolean
  preselectedTierId: string | null
  preselectedLicenseId: string | null
}>) {
  const licenseMove = useLicenseMove(orgId)
  const serverOptions = useMemo(() => licensedServerOptions(servers), [servers])
  const purchasable = useMemo(() => purchasableTiers(tiers), [tiers])
  // The operator's own pick, once made; `null` means the deep link still
  // governs (see `resolveLicenseId`).
  const [chosenLicenseId, setChosenLicenseId] = useState<{ value: string | null } | null>(null)
  const licenseId = resolveLicenseId(chosenLicenseId, preselectedLicenseId, serverOptions)
  const [targetTierId, setTargetTierId] = useState<string | null>(preselectedTierId)

  const server = servers.find((entry) => entry.licenseId === licenseId) ?? null
  const currentTier =
    tiers.find((tier) => tier.label === server?.tierPlacement?.licenseTier) ?? null
  const targetTier = purchasable.find((tier) => tier.id === targetTierId) ?? null
  const direction = tierChangeDirection(currentTier?.rank, targetTier?.rank)
  const pendingForLicense = pendingChangeForLicense(summary.pendingChanges, licenseId)
  const applying = pendingForLicense?.kind === 'upgrade'
  const locked = pastDue || pendingForLicense != null
  const canReview = licenseId != null && targetTier != null && direction !== 'same' && !locked
  const pickersDisabled = licenseMove.busy || locked

  const tierOptions: SelectOption[] = purchasable.map((tier) => ({
    value: tier.id,
    label: tier.label,
    detail: `${formatTierPrice(tier)} · fits up to ${formatFits(tier)}`,
    disabled: currentTier?.id === tier.id,
  }))

  const chooseTarget = (nextTierId: string | null) => {
    setTargetTierId(nextTierId)
    const next = purchasable.find((tier) => tier.id === nextTierId) ?? null
    void licenseMove.plan(plannedMove({ licenseId, currentTier, next, locked }))
  }

  return (
    <SectionPanel
      title="Move a license to another tier"
      hint="Upgrades are invoiced now and apply once paid; downgrades apply at the end of the period with no credit"
    >
      {serverOptions.length === 0 ? (
        <Text style={panelStyles.muted}>No server is bound to a licensed seat yet.</Text>
      ) : null}
      <Select
        value={licenseId}
        options={serverOptions}
        placeholder="Select a server"
        disabled={licenseMove.busy || serverOptions.length === 0}
        accessibilityLabel="Server whose license moves"
        onChange={(next) => {
          setChosenLicenseId({ value: next })
          licenseMove.reset()
        }}
      />
      <Select
        value={targetTierId}
        options={tierOptions}
        placeholder="Select a target tier"
        disabled={pickersDisabled || !licenseId}
        accessibilityLabel="Target tier"
        onChange={chooseTarget}
      />
      <MoveSummary
        server={server}
        currentTier={currentTier}
        targetTier={targetTier}
        direction={direction}
      />
      <MoveFeedback
        move={licenseMove.move}
        targetTier={targetTier}
        summary={summary}
        tiers={tiers}
        server={server}
        pendingForLicense={pendingForLicense}
        applying={applying}
        error={licenseMove.error}
      />
      <MoveActions
        move={licenseMove.move}
        direction={direction}
        canReview={canReview}
        busy={licenseMove.busy}
        submitting={licenseMove.submitting}
        confirmDisabled={pickersDisabled}
        onReview={() => chooseTarget(targetTierId)}
        onApply={() => {
          if (licenseId && targetTier) void licenseMove.apply(licenseId, targetTier.id)
        }}
        onCancel={() => {
          licenseMove.dismiss()
          setTargetTierId(null)
        }}
      />
      {pastDue ? (
        <Text style={panelStyles.muted}>
          Tier changes are paused while the subscription is past due.
        </Text>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  sizingCommand: {
    paddingVertical: spacing.xs,
  },
  pendingList: {
    gap: spacing.xs,
  },
  portal: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
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
