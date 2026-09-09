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
  canReleaseAt,
  describeBillingRefusal,
  describePendingChange,
  describeUncoveredServer,
  formatMachineExamples,
  formatMinorUnits,
  formatTierFits,
  formatTierPrice,
  formatTierSlots,
  isDelinquentSubscription,
  landsAtLabel,
  licenseSummaryLine,
  machineExamplesForTier,
  serverTitle,
  subscriptionStatusView,
  tierChangeDirection,
  uncoveredServers,
  type RefusalContext,
} from '@/lib/billing-display'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  BILLING_NOT_CONFIGURED_ERROR,
  hasLiveBillingSubscription,
  type BillingPreview,
  type BillingPreviewLine,
  type BillingServerCoverage,
  type BillingSubscriptionSummary,
  type BillingTier,
  type BillingTierSummary,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { BILLING_TIER_QUERY_PARAM } from '@/lib/org-navigation'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import type { ApiMutationResult } from '@/lib/query-client'
import {
  CHECKOUT_CONFIRM_POLL_MS,
  useBillingCatalog,
  useBillingSubscription,
  useChangeBillingSeats,
  useCreateBillingCheckout,
  useCreateBillingPortalSession,
  useDowngradeBillingTier,
  usePreviewBillingChange,
  useUpgradeBillingTier,
} from '@/lib/queries/billing'
import { useOrgServers } from '@/lib/queries/servers'
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

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function isNotConfigured(err: unknown): boolean {
  return err instanceof Error && err.message.includes(BILLING_NOT_CONFIGURED_ERROR)
}

/** The failure line for a mutation outcome: the refusal's next step when known, else the raw message. */
function failureOf(outcome: ApiMutationResult<unknown>, context: RefusalContext): string | null {
  if (outcome.ok) return null
  return describeBillingRefusal(outcome.cause, context) ?? outcome.error
}

const TIER_COLUMNS = [
  { key: 'tier', header: 'Tier', flex: 0.7, minWidth: 64 },
  { key: 'price', header: 'Per license', flex: 1.3, minWidth: 150 },
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

function tierOption(tier: BillingTier, disabled = false): SelectOption {
  return {
    value: tier.id,
    label: tier.label,
    detail: `${formatTierPrice(tier)} · fits up to ${formatTierFits(tier.entitlements)}`,
    disabled,
  }
}

/** Names the server a refusal points at, from the org servers list. */
function refusalContextFor(servers: readonly OrgServerRecord[]): RefusalContext {
  return {
    serverName: (serverId) => {
      const server = servers.find((entry) => entry.id === serverId)
      return server ? serverTitle(server) : null
    },
  }
}

export function BillingSection({ orgId }: Readonly<{ orgId: string }>) {
  const { billingEnabled } = useAuth()
  const params = useLocalSearchParams<{ tier?: string; checkout?: string }>()
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
          Licenses appear here as soon as the payment is confirmed. Starting another checkout now
          would create a second subscription.
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
        hint="Self-hosted control planes have no subscription. Licenses are managed by the host operator."
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
        coverage={subscriptionQuery.data?.servers ?? []}
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
      />
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Billing</Text>
      <Text style={panelStyles.pageCopy}>
        {`Licenses cover servers on ${HA_PRODUCT_NAME}. Each server uses one license; the tier it lands on comes from the licenses you bought and the server's hardware.`}
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
        body="You can now add servers from Servers → Add server; each one uses a license."
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
 * Servers the control plane could not place on anything bought, each with
 * the tier its hardware needs. Read from the projection's own placement —
 * never a client-side re-derivation. Renders nothing when every server is
 * covered.
 */
function UncoveredServersNotice({
  coverage,
  servers,
}: Readonly<{ coverage: readonly BillingServerCoverage[]; servers: readonly OrgServerRecord[] }>) {
  const uncovered = useMemo(() => uncoveredServers(coverage, servers), [coverage, servers])
  if (uncovered.length === 0) return null
  const count = uncovered.length
  return (
    <InlineNotice
      tone="warning"
      title={`${count} ${count === 1 ? 'server is' : 'servers are'} not covered`}
      body={`${uncovered.map(describeUncoveredServer).join('. ')}. Buy a license at that tier, or move one up.`}
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
              <Text style={panelStyles.detailLine}>{formatTierFits(tier.entitlements)}</Text>
              {examples ? <Text style={panelStyles.muted}>{examples}</Text> : null}
            </DataTableCell>
            <DataTableCell column={TC_SLOTS}>
              <Text style={panelStyles.muted}>{formatTierSlots(tier.entitlements)}</Text>
            </DataTableCell>
          </DataTableRow>
        )
      })}
    </DataTable>
  )
}

function parseLicenseCount(raw: string): number | null {
  const value = Number(raw.trim())
  return Number.isInteger(value) && value >= 1 ? value : null
}

function CheckoutPanel({
  orgId,
  tiers,
  coverage,
  servers,
  initialTierId,
}: Readonly<{
  orgId: string
  tiers: readonly BillingTier[]
  coverage: readonly BillingServerCoverage[]
  servers: readonly OrgServerRecord[]
  initialTierId: string | null
}>) {
  const checkout = useCreateBillingCheckout(orgId)
  const purchasable = useMemo(() => purchasableTiers(tiers), [tiers])
  const [selectedTierId, setSelectedTierId] = useState<string | null>(initialTierId)
  const [countText, setCountText] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const selectedTier = purchasable.find((tier) => tier.id === selectedTierId) ?? null
  const count = parseLicenseCount(countText)

  const startCheckout = async () => {
    if (!selectedTier || count == null) return
    setError(null)
    const outcome = await checkout.run({ tierId: selectedTier.id, quantity: count })
    if (outcome.ok) {
      openHostedPage(outcome.value.url)
    } else {
      setError(failureOf(outcome, refusalContextFor(servers)))
    }
  }

  return (
    <>
      <SectionPanel
        title="Choose a tier"
        hint="One license covers one server. Pick the smallest tier whose ceilings cover the host."
        accent
      >
        <InlineNotice
          title="Not sure which tier a host needs?"
          body="Run this on the host: the first number is its cores, the second line its RAM in GiB. Choose the lowest tier whose Fits up to column covers both."
          actions={<CopyButton value={SIZING_COMMAND} label="Copy command" />}
        />
        <MonoText style={styles.sizingCommand}>{SIZING_COMMAND}</MonoText>
        <UncoveredServersNotice coverage={coverage} servers={servers} />
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
        title="Buy the first licenses"
        hint="Payment is collected on a hosted checkout page"
      >
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Tier: </Text>
          {selectedTier
            ? `${selectedTier.label} · ${formatTierPrice(selectedTier)}`
            : 'Select a tier above'}
        </Text>
        <TextField
          label="Licenses"
          value={countText}
          onChangeText={setCountText}
          keyboardType="number-pad"
          editable={!checkout.isPending}
          accessibilityLabel="Number of licenses"
          hint="Whole number, at least 1. You can add or release licenses later."
        />
        {count == null ? (
          <Text style={panelStyles.error}>Licenses must be a whole number of at least 1.</Text>
        ) : null}
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        <ButtonRow>
          <Button
            label="Continue to checkout"
            variant="primary"
            busy={checkout.isPending}
            busyLabel="Opening checkout…"
            disabled={!selectedTier || count == null || checkout.isPending}
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
// Live subscription — licenses, per-tier counts, moves, portal.
// ---------------------------------------------------------------------------

function SubscriptionView({
  orgId,
  summary,
  tiers,
  servers,
  preselectedTierId,
}: Readonly<{
  orgId: string
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  servers: readonly OrgServerRecord[]
  preselectedTierId: string | null
}>) {
  const pastDue = isDelinquentSubscription(summary.subscription)
  const context = useMemo(() => refusalContextFor(servers), [servers])

  return (
    <>
      {pastDue ? <PastDueNotice summary={summary} /> : null}
      <LicensesPanel summary={summary} tiers={tiers} />
      <UncoveredServersNotice coverage={summary.servers} servers={servers} />
      <TierLicensesPanel
        orgId={orgId}
        summary={summary}
        tiers={tiers}
        pastDue={pastDue}
        context={context}
        preselectedTierId={preselectedTierId}
      />
      <MoveLicensePanel
        orgId={orgId}
        summary={summary}
        tiers={tiers}
        pastDue={pastDue}
        context={context}
        preselectedTierId={preselectedTierId}
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
  const next =
    'Update the payment method to resume; upgrades and new licenses are refused until the balance clears.'
  return (
    <InlineNotice
      tone="warning"
      title="Payment is past due — tier changes are paused"
      body={grace ? `Monitoring continues until ${formatLocalDateTime(grace)}. ${next}` : next}
      actions={
        summary.payer ? <PortalButton label="Update payment method" variant="primary" /> : undefined
      }
    />
  )
}

/** Org-wide license totals, the pending changes, and the portal link. */
function LicensesPanel({
  summary,
  tiers,
}: Readonly<{ summary: BillingSubscriptionSummary; tiers: readonly BillingTier[] }>) {
  const status = subscriptionStatusView(summary.subscription?.status)
  const licenses = summary.licenses
  const periodEnd = summary.subscription?.currentPeriodEnd
  return (
    <SectionPanel
      title="Licenses"
      hint={
        periodEnd
          ? `Current period ends ${formatLocalDateTime(periodEnd)}`
          : 'Period end not reported yet'
      }
      headerRight={<Badge label={status.label} tone={status.tone} />}
      accent
    >
      <StatTiles
        accessibilityLabel="License totals"
        items={[
          {
            key: 'purchased',
            icon: BillingNavIcon,
            value: licenses.purchased,
            label: 'PURCHASED',
            accessibilityLabel: `${licenses.purchased} purchased`,
          },
          {
            key: 'held',
            icon: AccessNavIcon,
            value: licenses.held,
            label: 'IN USE',
            accessibilityLabel: `${licenses.held} in use`,
          },
          {
            key: 'available',
            icon: ServersNavIcon,
            value: licenses.available,
            label: 'AVAILABLE',
            accessibilityLabel: `${licenses.available} available for new servers`,
          },
          {
            key: 'releasing',
            icon: BillingNavIcon,
            value: licenses.releasing,
            label: 'LEAVING',
            accessibilityLabel: `${licenses.releasing} leaving at period end`,
          },
        ]}
      />
      <Text style={panelStyles.detailLine}>{licenseSummaryLine(licenses)}</Text>
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
              {describePendingChange(change, tiers)}
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

// ---------------------------------------------------------------------------
// Quantity per tier: +1 (quoted, invoiced now) and −1 (released at period end).
// ---------------------------------------------------------------------------

type QuantityIntent = Readonly<{ tierId: string; delta: 1 | -1; preview: BillingPreview | null }>

/**
 * The +1 / −1 state machine shared by every tier row and the buy-at-tier
 * picker: idle → intent (a quote for +1, nothing to quote for −1) → confirm.
 * Owns the two provider calls and the last error so the panel only wires
 * buttons to it.
 */
function useLicenseQuantity(orgId: string, context: RefusalContext) {
  const preview = usePreviewBillingChange()
  const change = useChangeBillingSeats(orgId)
  const [intent, setIntent] = useState<QuantityIntent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const begin = async (tierId: string, delta: 1 | -1) => {
    setError(null)
    if (delta < 0) {
      // A release defers to the period boundary and is never invoiced, so
      // there is no quote to show — just the consequence.
      setIntent({ tierId, delta, preview: null })
      return
    }
    const outcome = await preview.run({ tierId, delta })
    if (outcome.ok) setIntent({ tierId, delta, preview: outcome.value })
    else setError(failureOf(outcome, context))
  }

  const confirm = async () => {
    if (!intent) return
    setError(null)
    const outcome = await change.run({
      tierId: intent.tierId,
      delta: intent.delta,
      ...(intent.preview ? { prorationDate: intent.preview.prorationDate } : {}),
    })
    if (outcome.ok) setIntent(null)
    else setError(failureOf(outcome, context))
  }

  const cancel = () => {
    setIntent(null)
    setError(null)
  }

  return {
    intent,
    error,
    begin,
    confirm,
    cancel,
    busy: preview.isPending || change.isPending,
    submitting: change.isPending,
  }
}

const LICENSE_COLUMNS = [
  { key: 'tier', header: 'Tier', flex: 0.6, minWidth: 56 },
  { key: 'price', header: 'Per license', flex: 1.2, minWidth: 140 },
  { key: 'purchased', header: 'Purchased', flex: 0.8, minWidth: 90, align: 'end' },
  { key: 'inUse', header: 'In use', flex: 0.8, minWidth: 80, align: 'end' },
  { key: 'releasing', header: 'Leaving', flex: 0.8, minWidth: 80, align: 'end' },
  { key: 'actions', header: '', flex: 1.4, minWidth: 150 },
] as const satisfies readonly DataTableColumn[]

const [LC_TIER, LC_PRICE, LC_PURCHASED, LC_IN_USE, LC_RELEASING, LC_ACTIONS] = LICENSE_COLUMNS

function TierLicensesRow({
  tier,
  index,
  last,
  disabled,
  addDisabled,
  onAdd,
  onRelease,
}: Readonly<{
  tier: BillingTierSummary
  index: number
  last: boolean
  disabled: boolean
  addDisabled: boolean
  onAdd: () => void
  onRelease: () => void
}>) {
  return (
    <DataTableRow alt={index % 2 === 1} last={last} accessibilityLabel={`Licenses at ${tier.label}`}>
      <DataTableCell column={LC_TIER}>
        <MonoText>{tier.label}</MonoText>
      </DataTableCell>
      <DataTableCell column={LC_PRICE}>
        <Text style={panelStyles.detailLine}>{formatTierPrice(tier)}</Text>
      </DataTableCell>
      <DataTableCell column={LC_PURCHASED}>
        <Text style={panelStyles.detailLine}>{tier.purchased}</Text>
      </DataTableCell>
      <DataTableCell column={LC_IN_USE}>
        <Text style={panelStyles.detailLine}>{tier.inUse}</Text>
      </DataTableCell>
      <DataTableCell column={LC_RELEASING}>
        <Text style={panelStyles.detailLine}>{tier.releasing}</Text>
      </DataTableCell>
      <DataTableCell column={LC_ACTIONS}>
        <ButtonRow>
          <Button
            label="+1"
            size="sm"
            disabled={disabled || addDisabled}
            accessibilityLabel={`Buy one more license at ${tier.label}`}
            onPress={onAdd}
          />
          <Button
            label="−1"
            size="sm"
            variant="ghost"
            disabled={disabled || !canReleaseAt(tier)}
            accessibilityLabel={`Release one license at ${tier.label}`}
            onPress={onRelease}
          />
        </ButtonRow>
      </DataTableCell>
    </DataTableRow>
  )
}

/** The quote, the release terms, the error, and Confirm / Cancel for the intent in flight. */
function QuantityFeedback({
  intent,
  error,
  summary,
  tiers,
  busy,
  submitting,
  onConfirm,
  onCancel,
}: Readonly<{
  intent: QuantityIntent | null
  error: string | null
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  busy: boolean
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  const label = intent ? (tiers.find((tier) => tier.id === intent.tierId)?.label ?? intent.tierId) : ''
  return (
    <>
      {intent?.delta === 1 && intent.preview ? (
        <PreviewNotice preview={intent.preview} title={`Buying one more license at ${label}`} />
      ) : null}
      {intent?.delta === -1 ? (
        <InlineNotice
          tone="warning"
          title={`Releasing one license at ${label}`}
          body={`The license leaves ${landsAtLabel(summary.subscription?.currentPeriodEnd)} with no credit for the remaining time. Every server stays covered until then; the release is refused if a server would be left on nothing.`}
        />
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {intent ? (
        <ButtonRow>
          <Button
            label={intent.delta === 1 ? 'Confirm and pay' : 'Confirm release'}
            variant="primary"
            size="sm"
            busy={submitting}
            disabled={busy}
            onPress={onConfirm}
          />
          <Button label="Cancel" variant="ghost" size="sm" disabled={busy} onPress={onCancel} />
        </ButtonRow>
      ) : null}
    </>
  )
}

/**
 * Tiers the org has not bought at yet — the picker below the table. The
 * `?tier=` deep link lands here when it names one of them; otherwise the
 * row's own +1 covers it.
 */
function unownedTierOptions(
  tiers: readonly BillingTier[],
  owned: readonly BillingTierSummary[]
): SelectOption[] {
  const ownedIds = new Set(owned.map((tier) => tier.tierId))
  return purchasableTiers(tiers)
    .filter((tier) => !ownedIds.has(tier.id))
    .map((tier) => tierOption(tier))
}

function TierLicensesPanel({
  orgId,
  summary,
  tiers,
  pastDue,
  context,
  preselectedTierId,
}: Readonly<{
  orgId: string
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  pastDue: boolean
  context: RefusalContext
  preselectedTierId: string | null
}>) {
  const quantity = useLicenseQuantity(orgId, context)
  const otherOptions = useMemo(() => unownedTierOptions(tiers, summary.tiers), [tiers, summary.tiers])
  const [otherTierId, setOtherTierId] = useState<string | null>(preselectedTierId)
  const otherSelectable = otherOptions.some((option) => option.value === otherTierId)
  const busy = quantity.busy || quantity.intent != null

  return (
    <SectionPanel
      title="Licenses by tier"
      hint="+1 buys one more at that tier and is invoiced now; −1 releases one at the end of the period"
    >
      <DataTable columns={LICENSE_COLUMNS} minWidth={600} bordered>
        {summary.tiers.length === 0 ? (
          <DataTableEmpty>No licenses bought yet.</DataTableEmpty>
        ) : null}
        {summary.tiers.map((tier, index) => (
          <TierLicensesRow
            key={tier.tierId}
            tier={tier}
            index={index}
            last={index === summary.tiers.length - 1}
            disabled={busy}
            addDisabled={pastDue}
            onAdd={() => {
              void quantity.begin(tier.tierId, 1)
            }}
            onRelease={() => {
              void quantity.begin(tier.tierId, -1)
            }}
          />
        ))}
      </DataTable>
      {otherOptions.length > 0 ? (
        <View style={styles.buyOther}>
          <Text style={panelStyles.detailLabel}>Buy a license at another tier</Text>
          <Select
            value={otherSelectable ? otherTierId : null}
            options={otherOptions}
            placeholder="Choose a tier"
            disabled={busy || pastDue}
            accessibilityLabel="Tier to buy a license at"
            onChange={setOtherTierId}
          />
          <ButtonRow>
            <Button
              label="Buy one"
              size="sm"
              disabled={busy || pastDue || !otherSelectable}
              onPress={() => {
                if (otherTierId) void quantity.begin(otherTierId, 1)
              }}
            />
          </ButtonRow>
        </View>
      ) : null}
      <QuantityFeedback
        intent={quantity.intent}
        error={quantity.error}
        summary={summary}
        tiers={tiers}
        busy={quantity.busy}
        submitting={quantity.submitting}
        onConfirm={() => {
          void quantity.confirm()
        }}
        onCancel={quantity.cancel}
      />
      {pastDue ? (
        <Text style={panelStyles.muted}>New licenses resume once the past-due balance clears.</Text>
      ) : null}
    </SectionPanel>
  )
}

// ---------------------------------------------------------------------------
// Provider quotes.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Move a license between tiers: a quantity moves, never a named license.
// ---------------------------------------------------------------------------

type MoveState =
  | { kind: 'idle' }
  | { kind: 'previewing' }
  | { kind: 'upgrade'; preview: BillingPreview }
  | { kind: 'downgrade' }

type MovePair = Readonly<{ from: BillingTier; to: BillingTier }>

function isConfirmable(
  move: MoveState
): move is Extract<MoveState, { kind: 'upgrade' | 'downgrade' }> {
  return move.kind === 'upgrade' || move.kind === 'downgrade'
}

/**
 * The move state machine: idle → (quote) → upgrade | downgrade → idle. An
 * upgrade is quoted by the provider first so the operator sees the proration
 * before paying; a downgrade needs no quote. Owns the three provider calls
 * and the last error so the panel only wires pickers to it.
 */
function useTierMove(orgId: string, context: RefusalContext) {
  const preview = usePreviewBillingChange()
  const upgrade = useUpgradeBillingTier(orgId)
  const downgrade = useDowngradeBillingTier(orgId)
  const [move, setMove] = useState<MoveState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMove({ kind: 'idle' })
    setError(null)
  }

  /** Settle on what the pair implies, quoting an upgrade first. */
  const plan = async (pair: MovePair | null) => {
    setError(null)
    const direction = tierChangeDirection(pair?.from.rank, pair?.to.rank)
    if (!pair || direction === 'same') {
      setMove({ kind: 'idle' })
      return
    }
    if (direction === 'downgrade') {
      setMove({ kind: 'downgrade' })
      return
    }
    setMove({ kind: 'previewing' })
    const outcome = await preview.run({ fromTierId: pair.from.id, toTierId: pair.to.id })
    // A failed quote drops back to idle so the picker can be retried.
    setMove(outcome.ok ? { kind: 'upgrade', preview: outcome.value } : { kind: 'idle' })
    setError(failureOf(outcome, context))
  }

  const apply = async (pair: MovePair) => {
    if (!isConfirmable(move)) return
    setError(null)
    const body = { fromTierId: pair.from.id, toTierId: pair.to.id }
    const outcome =
      move.kind === 'upgrade'
        ? await upgrade.run({ ...body, prorationDate: move.preview.prorationDate })
        : await downgrade.run(body)
    // A failed apply keeps the quote on screen so the operator can retry.
    if (outcome.ok) setMove({ kind: 'idle' })
    setError(failureOf(outcome, context))
  }

  return {
    move,
    error,
    plan,
    apply,
    reset,
    busy: preview.isPending || upgrade.isPending || downgrade.isPending,
    submitting: upgrade.isPending || downgrade.isPending,
  }
}

/** Tiers a license can move *from*: bought, and not already leaving in full. */
function fromTierOptions(
  owned: readonly BillingTierSummary[],
  tiers: readonly BillingTier[]
): SelectOption[] {
  return owned
    .filter((tier) => canReleaseAt(tier))
    .map((tier) => {
      const catalogue = tiers.find((entry) => entry.id === tier.tierId)
      const detail = [`${tier.purchased} purchased`, `${tier.inUse} in use`]
      if (catalogue) detail.push(formatTierPrice(catalogue))
      return {
        value: tier.tierId,
        label: tier.label,
        detail: detail.join(' · '),
      }
    })
}

/** Everything the panel says about the move in flight: the quote, the downgrade terms, and the last error. */
function MoveFeedback({
  move,
  pair,
  summary,
  error,
}: Readonly<{
  move: MoveState
  pair: MovePair | null
  summary: BillingSubscriptionSummary
  error: string | null
}>) {
  return (
    <>
      {move.kind === 'previewing' ? <LoadingState label="Fetching the quote…" /> : null}
      {move.kind === 'upgrade' && pair ? (
        <PreviewNotice
          preview={move.preview}
          title={`Moving one license from ${pair.from.label} to ${pair.to.label}`}
        />
      ) : null}
      {move.kind === 'downgrade' && pair ? (
        <InlineNotice
          tone="warning"
          title={`Moving one license from ${pair.from.label} down to ${pair.to.label}`}
          body={`The move lands ${landsAtLabel(summary.subscription?.currentPeriodEnd)}. No credit is issued for the remaining time. It is refused if a server would be left on nothing.`}
        />
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </>
  )
}

function MoveActions({
  move,
  busy,
  submitting,
  onApply,
  onCancel,
}: Readonly<{
  move: MoveState
  busy: boolean
  submitting: boolean
  onApply: () => void
  onCancel: () => void
}>) {
  if (!isConfirmable(move)) return null
  return (
    <ButtonRow>
      <Button
        label={move.kind === 'upgrade' ? 'Confirm upgrade and pay' : 'Schedule downgrade'}
        variant="primary"
        busy={submitting}
        disabled={busy}
        onPress={onApply}
      />
      <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
    </ButtonRow>
  )
}

/** The two tiers as a pair once both are picked; `null` until then. */
function movePair(
  purchasable: readonly BillingTier[],
  fromTierId: string | null,
  toTierId: string | null
): MovePair | null {
  const from = purchasable.find((tier) => tier.id === fromTierId)
  const to = purchasable.find((tier) => tier.id === toTierId)
  return from && to ? { from, to } : null
}

function MovePickers({
  fromTierId,
  toTierId,
  fromOptions,
  toOptions,
  disabled,
  onChange,
}: Readonly<{
  fromTierId: string | null
  toTierId: string | null
  fromOptions: readonly SelectOption[]
  toOptions: readonly SelectOption[]
  disabled: boolean
  onChange: (fromTierId: string | null, toTierId: string | null) => void
}>) {
  return (
    <>
      {fromOptions.length === 0 ? (
        <Text style={panelStyles.muted}>No license can move until one is bought.</Text>
      ) : null}
      <Select
        value={fromTierId}
        options={fromOptions}
        placeholder="From tier"
        disabled={disabled || fromOptions.length === 0}
        accessibilityLabel="Tier the license moves from"
        onChange={(next) => onChange(next, toTierId)}
      />
      <Select
        value={toTierId}
        options={toOptions}
        placeholder="To tier"
        disabled={disabled || !fromTierId}
        accessibilityLabel="Tier the license moves to"
        onChange={(next) => onChange(fromTierId, next)}
      />
    </>
  )
}

function MoveLicensePanel({
  orgId,
  summary,
  tiers,
  pastDue,
  context,
  preselectedTierId,
}: Readonly<{
  orgId: string
  summary: BillingSubscriptionSummary
  tiers: readonly BillingTier[]
  pastDue: boolean
  context: RefusalContext
  preselectedTierId: string | null
}>) {
  const tierMove = useTierMove(orgId, context)
  const purchasable = useMemo(() => purchasableTiers(tiers), [tiers])
  const fromOptions = useMemo(() => fromTierOptions(summary.tiers, tiers), [summary.tiers, tiers])
  const [fromTierId, setFromTierId] = useState<string | null>(null)
  const [toTierId, setToTierId] = useState<string | null>(preselectedTierId)

  const pair = movePair(purchasable, fromTierId, toTierId)
  const direction = tierChangeDirection(pair?.from.rank, pair?.to.rank)
  const toOptions: SelectOption[] = purchasable.map((tier) => tierOption(tier, tier.id === fromTierId))

  const choose = (nextFromId: string | null, nextToId: string | null) => {
    setFromTierId(nextFromId)
    setToTierId(nextToId)
    void tierMove.plan(movePair(purchasable, nextFromId, nextToId))
  }

  return (
    <SectionPanel
      title="Move a license"
      hint="Up the ladder is invoiced now and applies once paid; down the ladder applies at the end of the period with no credit"
    >
      <MovePickers
        fromTierId={fromTierId}
        toTierId={toTierId}
        fromOptions={fromOptions}
        toOptions={toOptions}
        disabled={tierMove.busy || pastDue}
        onChange={choose}
      />
      {direction === 'same' ? null : (
        <Text style={panelStyles.muted}>
          {pair?.from.label} → {pair?.to.label} ({direction})
        </Text>
      )}
      <MoveFeedback move={tierMove.move} pair={pair} summary={summary} error={tierMove.error} />
      <MoveActions
        move={tierMove.move}
        busy={tierMove.busy}
        submitting={tierMove.submitting}
        onApply={() => {
          if (pair) void tierMove.apply(pair)
        }}
        onCancel={() => {
          tierMove.reset()
          setToTierId(null)
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
  buyOther: {
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
