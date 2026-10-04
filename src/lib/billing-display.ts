import {
  BillingRefusalError,
  BILLING_MUTATION_IN_PROGRESS_ERROR,
  BILLING_NOT_CONFIGURED_ERROR,
  CHECKOUT_PENDING_ERROR,
  DELINQUENT_SUBSCRIPTION_STATUSES,
  formatShortDate,
  LICENSES_ENDING_ERROR,
  LICENSES_IN_USE_ERROR,
  NO_LICENSES_ENDING_ERROR,
  NO_SUBSCRIPTION_ERROR,
  NOT_A_DOWNGRADE_ERROR,
  NOT_AN_UPGRADE_ERROR,
  SERVERS_UNCOVERED_ERROR,
  SUBSCRIPTION_EXISTS_ERROR,
  STRIPE_ERROR,
  SUBSCRIPTION_PAST_DUE_ERROR,
  TIER_NOT_PURCHASABLE_ERROR,
  type BillingLicenseSummary,
  type BillingPendingChange,
  type BillingServerCoverage,
  type BillingSubscriptionState,
  type BillingTier,
  type BillingTierEntitlements,
  type BillingTierSummary,
  type LicenseAvailability,
  type OrgServerRecord,
} from '@/lib/instance-api'
import type { BadgeTone } from '@/components/ui/badge'
import { formatLocalDateTime } from '@/lib/format-datetime'

/**
 * Presentation helpers for the billing screen. Amounts arrive from the
 * provider as integer minor units and are formatted here — never summed,
 * prorated or otherwise computed on the client.
 *
 * Vocabulary: the operator buys **licenses** and runs **servers**. A
 * license is plumbing — it is never shown as an object here; the page
 * counts them per tier and names the servers they cover.
 */

/** `1999` + `usd` → `$19.99`; a missing currency renders the raw minor units. */
export function formatMinorUnits(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  if (!currency) return `${(amount / 100).toFixed(2)}`
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** Every priced tier bills in this currency when the row has not cached one yet. */
const DEFAULT_CURRENCY = 'usd'

/**
 * Catalogue price per license per month. Custom tiers are negotiated; a
 * priced row whose product has not been verified yet has no price to show.
 */
export function formatTierPrice(
  tier: Readonly<{ priceCents: number | null; currency?: string | null; isCustom?: boolean }>
): string {
  if (tier.isCustom) return 'Negotiated'
  if (tier.priceCents == null) return 'Price not available'
  return `${formatMinorUnits(tier.priceCents, tier.currency ?? DEFAULT_CURRENCY)} / license / month`
}

const GIB = 1024 ** 3

/** `17179869184` → `16 GiB` (whole GiB, one decimal when it is not whole). */
export function formatMemoryLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const gib = bytes / GIB
  return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`
}

/** `16 cores · 64 GiB`, or an em dash for a tier the ladder no longer describes. */
export function formatTierFits(entitlements: BillingTierEntitlements | null | undefined): string {
  if (!entitlements) return '—'
  return `${entitlements.maxCores} cores · ${formatMemoryLimit(entitlements.maxMemoryBytes)}`
}

/** `5 NIC · 6 drive · 2 GPU · 9 extra FS`. */
export function formatTierSlots(entitlements: BillingTierEntitlements | null | undefined): string {
  if (!entitlements) return '—'
  const { nicSlots, driveSlots, gpuSlots, filesystemSlots } = entitlements
  return `${nicSlots} NIC · ${driveSlots} drive · ${gpuSlots} GPU · ${filesystemSlots} extra FS`
}

export type SubscriptionStatusView = {
  label: string
  tone: BadgeTone
}

/**
 * Provider status → operator-facing chip. Unknown statuses pass through
 * verbatim in a muted tone rather than being hidden.
 */
export function subscriptionStatusView(status: string | null | undefined): SubscriptionStatusView {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'ok' }
    case 'trialing':
      return { label: 'Trial', tone: 'info' }
    case 'past_due':
      return { label: 'Past due', tone: 'danger' }
    case 'incomplete':
      return { label: 'Awaiting payment', tone: 'pending' }
    case 'canceled':
      return { label: 'Canceled', tone: 'muted' }
    case 'unpaid':
      return { label: 'Unpaid', tone: 'danger' }
    case 'incomplete_expired':
      return { label: 'Expired', tone: 'muted' }
    case null:
    case undefined:
    case '':
      return { label: 'No subscription', tone: 'muted' }
    default:
      return { label: status, tone: 'muted' }
  }
}

/**
 * Delinquent = the server refuses entitlement-raising changes
 * (`subscription_past_due`): `past_due` while Smart Retries run, `unpaid`
 * once they are exhausted. Both are still live subscriptions.
 */
export function isDelinquentSubscription(
  subscription: BillingSubscriptionState | null | undefined
): boolean {
  const status = subscription?.status
  return typeof status === 'string' && DELINQUENT_SUBSCRIPTION_STATUSES.has(status)
}

export type TierChangeDirection = 'upgrade' | 'downgrade' | 'same'

/** Compares two catalogue ranks; `same` also covers a missing side. */
export function tierChangeDirection(
  fromRank: number | null | undefined,
  toRank: number | null | undefined
): TierChangeDirection {
  if (fromRank == null || toRank == null || fromRank === toRank) return 'same'
  return toRank > fromRank ? 'upgrade' : 'downgrade'
}

type TierLabelSource = readonly Pick<BillingTier, 'id' | 'label'>[]

/** Resolves a tier id to its label; an unknown id falls back to the id so nothing is hidden. */
export function tierLabelOf(tiers: TierLabelSource, tierId: string | null | undefined): string {
  if (tierId == null) return '—'
  return tiers.find((tier) => tier.id === tierId)?.label ?? tierId
}

/** `on 1 Oct 2026, 00:00` or, when the provider had not reported a period end, `at the end of the current period`. */
export function landsAtLabel(landsAt: string | null | undefined): string {
  return landsAt ? `on ${formatLocalDateTime(landsAt)}` : 'at the end of the current period'
}

/** Sentence for a pending-change row. Tier ids are resolved to labels via the catalogue. */
export function describePendingChange(change: BillingPendingChange, tiers: TierLabelSource): string {
  const from = tierLabelOf(tiers, change.fromTierId)
  const when = landsAtLabel(change.landsAt)
  switch (change.kind) {
    case 'downgrade':
      return `One license moves from ${from} to ${tierLabelOf(tiers, change.toTierId)} ${when}.`
    case 'release-seat':
      return `One ${from} license ends ${when}.`
  }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * `3 end Oct 26` / `1 ends Oct 26` — the "Ends" column and every sentence
 * about licenses scheduled to end. Empty when nothing is ending.
 */
export function endingLabel(ending: number, endsAt: string | null | undefined): string {
  // NaN is "nothing ending" too, exactly as `!(ending > 0)` treated it.
  if (Number.isNaN(ending) || ending <= 0) return ''
  const when = formatShortDate(endsAt) ?? 'at the end of the period'
  return `${ending} ${ending === 1 ? 'ends' : 'end'} ${when}`
}

/**
 * The wire aliases an older control plane still sends instead of `inUse` /
 * `ending`. Typed here, apart from `BillingLicenseSummary` and
 * `BillingTierSummary` where they are marked deprecated, so the one place that
 * still has to read them is this pair of helpers.
 */
type LegacyLicenseCounts = Readonly<{ inUse?: number; held?: number }>
type LegacyTierCounts = Readonly<{ ending: number; releasing?: number }>

/**
 * Licenses an org holds: `inUse` from a current control plane, `held` from an
 * older one. This is the only read of the deprecated `held` alias.
 */
export function licensesInUse(licenses: LegacyLicenseCounts): number {
  return licenses.inUse ?? licenses.held ?? 0
}

/**
 * `3 of 6 licenses in use (1 provisioning) · 1 held by an unused key · 3 end
 * Oct 26 · no room for another server` — the org-wide line under the
 * Licenses tiles. An ending license is never counted as in use; it is named
 * with its date instead. A key whose server is still provisioning is in use;
 * a key never used holds a license and is named as such.
 */
export function licenseSummaryLine(licenses: BillingLicenseSummary): string {
  const provisioning = licenses.provisioning ?? 0
  const parts = [
    `${licensesInUse(licenses)} of ${plural(licenses.purchased, 'license', 'licenses')} in use${
      provisioning > 0 ? ` (${provisioning} provisioning)` : ''
    }`,
  ]
  const unusedKeys = licenses.unusedKeys ?? 0
  if (unusedKeys > 0) {
    parts.push(`${unusedKeys} held by ${unusedKeys === 1 ? 'an unused key' : 'unused keys'}`)
  }
  const ending = endingLabel(licenses.ending ?? 0, licenses.endsAt)
  if (ending) parts.push(ending)
  if (licenses.available === 0) {
    parts.push(ending ? 'restore one to add another server' : 'no room for another server')
  } else {
    parts.push(`${plural(licenses.available, 'more server', 'more servers')} can be added`)
  }
  return parts.join(' · ')
}

/** `Licenses at S3: 2 purchased, 1 in use` (plus `, 1 ends Oct 26` when set). */
export function tierLicensesLine(tier: BillingTierSummary): string {
  const parts = [`${tier.purchased} purchased`, `${tier.inUse} in use`]
  const ending = endingLabel(tier.ending, tier.endsAt)
  if (ending) parts.push(ending)
  return `Licenses at ${tier.label}: ${parts.join(', ')}`
}

/** Seats already on their way out at this tier: ending licenses, plus pending downgrades when the server still reports them. */
function outgoingAt(tier: LegacyTierCounts): number {
  // The only read of the deprecated `releasing` alias (an older control plane's ending + pending downgrades).
  return Math.max(tier.ending, tier.releasing ?? 0)
}

/** True when one license at this tier can still move away, as far as the projection shows. */
export function canReleaseAt(tier: BillingTierSummary): boolean {
  return tier.purchased - outgoingAt(tier) > 0
}

/**
 * How many licenses at this tier Remove may offer: bought, not already
 * ending, and not covering a server. Advisory — the control plane refuses
 * a removal that would strand a server or a waiting key.
 */
export function removableAt(tier: BillingTierSummary): number {
  return Math.max(0, tier.purchased - outgoingAt(tier) - tier.inUse)
}

/** A whole number of licenses, at least 1; `null` for anything else. */
export function parseLicenseCount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value >= 1 ? value : null
}

/** What the Add Server screen can do for the tier a server needs. */
export type AddServerTierState =
  | Readonly<{ kind: 'available'; available: number; message: string }>
  | Readonly<{ kind: 'restore'; ending: number; endsAt: string | null; message: string }>
  | Readonly<{ kind: 'buy'; message: string }>

/** Org-wide totals that cap what a tier can offer (`GET /billing/subscription` → `licenses`). */
export type OrgLicenseCap = Pick<BillingLicenseSummary, 'available' | 'unusedKeys'>

/**
 * How many licenses at a tier can actually take a new server: the tier's own
 * count, capped by the org-wide `available`. Unused registration keys (and
 * servers still provisioning) hold licenses without a tier yet, so a tier
 * can look free while the org has nothing left — this is the one number the
 * Add Server screen shows, so it never contradicts the mint refusal.
 */
export function effectiveTierAvailable(
  tier: Pick<BillingTierSummary, 'available'> | null | undefined,
  org?: OrgLicenseCap | null
): number {
  const own = Math.max(0, tier?.available ?? 0)
  if (!org || !Number.isFinite(org.available)) return own
  return Math.min(own, Math.max(0, org.available))
}

/**
 * The chosen tier's situation, restore before buy: a free license there is
 * used as-is; otherwise an ending one must be restored before anything new
 * is bought at that tier (the control plane refuses the purchase anyway).
 * Ending licenses at *other* tiers never matter here. When licenses are held
 * by unused registration keys, the buy message says so — deleting a key
 * frees its license without buying one.
 */
export function addServerTierState(
  label: string,
  tier: Pick<BillingTierSummary, 'available' | 'ending' | 'endsAt'> | null | undefined,
  org?: OrgLicenseCap | null
): AddServerTierState {
  const available = effectiveTierAvailable(tier, org)
  if (available > 0) {
    const licenseCount = plural(available, `${label} license is`, `${label} licenses are`)
    return { kind: 'available', available, message: `${licenseCount} free for this server.` }
  }
  const ending = tier?.ending ?? 0
  if (ending > 0) {
    return {
      kind: 'restore',
      ending,
      endsAt: tier?.endsAt ?? null,
      message: `No ${label} license is free. ${endingLabel(ending, tier?.endsAt)} — restore one to use it for this server.`,
    }
  }
  const unusedKeys = Math.max(0, org?.unusedKeys ?? 0)
  if (unusedKeys > 0) {
    return {
      kind: 'buy',
      message: `No ${label} license is free. ${plural(unusedKeys, 'license is', 'licenses are')} held by unused registration keys — delete one to free it, or buy another.`,
    }
  }
  return { kind: 'buy', message: `No ${label} license is free. Buy one to add this server.` }
}

export function serverTitle(server: Pick<OrgServerRecord, 'id' | 'name' | 'hostname'>): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

export type UncoveredServer = Readonly<{
  serverId: string
  name: string
  /** What the hardware needs; `null` while the server has not reported it. */
  requiredTier: string | null
}>

/**
 * Servers the control plane could not place on anything bought, named
 * via the org servers list (falling back to the id) and sorted by name.
 */
export function uncoveredServers(
  coverage: readonly BillingServerCoverage[] | null | undefined,
  servers: readonly OrgServerRecord[]
): UncoveredServer[] {
  const byId = new Map(servers.map((server) => [server.id, server]))
  return (coverage ?? [])
    .filter((entry) => entry.assignedTierId === null)
    .map((entry) => {
      const server = byId.get(entry.serverId)
      return {
        serverId: entry.serverId,
        name: server ? serverTitle(server) : entry.serverId,
        requiredTier: entry.requiredTier,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** `web-1 needs S5` / `web-1 has not reported hardware yet`. */
export function describeUncoveredServer(entry: UncoveredServer): string {
  return entry.requiredTier
    ? `${entry.name} needs ${entry.requiredTier}`
    : `${entry.name} has not reported hardware yet`
}

/**
 * The tier a refused Add Server should act on: the one the operator picked,
 * else the first tier the refusal says has licenses ending (restore before buy).
 */
export function refusalTierId(
  chosenTierId: string | null,
  refusal: Pick<LicenseAvailability, 'tiers'> | null
): string | null {
  if (chosenTierId) return chosenTierId
  return refusal?.tiers.find((tier) => tier.ending > 0)?.tierId ?? null
}

export type RefusalContext = Readonly<{
  /** Server name for the id a `servers_uncovered` refusal names; `null` falls back to the id. */
  serverName?: (serverId: string) => string | null
  /** Tier label for the id a `licenses_ending` refusal names; `null` falls back to "that tier". */
  tierLabel?: (tierId: string) => string | null
}>

/**
 * What to do next, for a refusal the billing routes answer with. `null`
 * for anything that is not a known refusal, so the caller shows the raw
 * message instead of guessing.
 */
export function describeBillingRefusal(err: unknown, context: RefusalContext = {}): string | null {
  if (!(err instanceof BillingRefusalError)) return null
  switch (err.code) {
    case SERVERS_UNCOVERED_ERROR:
      return describeServersUncovered(err, context)
    case LICENSES_IN_USE_ERROR:
      return describeLicensesInUse(err)
    case SUBSCRIPTION_PAST_DUE_ERROR:
      return 'Payment is past due. Update the payment method, then try again.'
    case NO_SUBSCRIPTION_ERROR:
      return 'There is no subscription to change. Buy the first license below.'
    case SUBSCRIPTION_EXISTS_ERROR:
      return 'This organization already has a subscription. Refresh the page to see it.'
    case BILLING_MUTATION_IN_PROGRESS_ERROR:
      return 'Another billing change is still being applied. Try again in a moment.'
    case NOT_AN_UPGRADE_ERROR:
      return 'That move goes down the ladder — it applies at the end of the period, not now.'
    case NOT_A_DOWNGRADE_ERROR:
      return 'That move goes up the ladder — it is invoiced now, not at the end of the period.'
    case TIER_NOT_PURCHASABLE_ERROR:
      return 'That tier cannot be bought right now. Ask the administrator to check its product.'
    case LICENSES_ENDING_ERROR:
      return describeLicensesEnding(err, context)
    case NO_LICENSES_ENDING_ERROR:
      return 'Nothing is ending at that tier any more. Refresh the page.'
    case CHECKOUT_PENDING_ERROR:
      return 'A checkout is already open for this organization. Finish it, or wait for it to expire, then try again.'
    case STRIPE_ERROR:
      return 'The payment provider could not complete that. Nothing was changed; try again in a moment.'
    case BILLING_NOT_CONFIGURED_ERROR:
      return 'Billing is not set up on this control plane yet. Ask the administrator.'
    default:
      return null
  }
}

function describeServersUncovered(err: BillingRefusalError, context: RefusalContext): string {
  const serverId = err.text('serverId')
  const name = (serverId && context.serverName?.(serverId)) || serverId || 'A server'
  const tier = err.text('requiredTier')
  return tier
    ? `${name} needs ${tier} and would be left uncovered. Move a license up to ${tier} or buy one there first.`
    : `${name} would be left uncovered. Buy or move a license that covers it first.`
}

function describeLicensesInUse(err: BillingRefusalError): string {
  const unused = err.count('unusedKeys') ?? 0
  if (unused > 0) {
    const keys = plural(unused, 'license key', 'license keys')
    const pronoun = unused === 1 ? 'it' : 'them'
    return `You have ${keys} not yet used: use or delete ${pronoun} before removing licenses.`
  }
  const held = err.count('licensesHeld')
  const after = err.count('purchasedAfter')
  return held != null && after != null
    ? `${plural(held, 'license is', 'licenses are')} in use but only ${after} would remain. Remove a server or a waiting key first.`
    : 'More licenses are in use than would remain. Remove a server or a waiting key first.'
}

function describeLicensesEnding(err: BillingRefusalError, context: RefusalContext): string {
  const tierId = err.text('tierId')
  const label = (tierId && context.tierLabel?.(tierId)) || null
  const ending = err.count('ending') ?? 0
  const count = ending > 0 ? ending : 'Some'
  const tierPart = label ? `${label} ` : ''
  const noun = ending === 1 ? 'license' : 'licenses'
  const short = formatShortDate(err.text('endsAt'))
  const when = short ? ` ${short}` : ' at the end of the period'
  return `You have ${count} ${tierPart}${noun} ending${when} — restore those first.`
}

// ---------------------------------------------------------------------------
// Recognisable machine examples per tier.
// ---------------------------------------------------------------------------

/** A familiar machine shape an operator can picture without running `nproc`. */
export type MachineExample = Readonly<{
  name: string
  cores: number
  memoryBytes: number
  gpus: number
}>

/**
 * Fixed shapes, smallest first. Each is *placed* against the live catalogue
 * ceilings rather than pinned to a tier, so a ladder change moves the
 * examples with it.
 */
export const MACHINE_EXAMPLES: readonly MachineExample[] = [
  { name: 'Raspberry Pi 5', cores: 4, memoryBytes: 8 * GIB, gpus: 0 },
  { name: 'small VPS (2 vCPU · 4 GiB)', cores: 2, memoryBytes: 4 * GIB, gpus: 0 },
  { name: 'mid VPS (4 vCPU · 16 GiB)', cores: 4, memoryBytes: 16 * GIB, gpus: 0 },
  { name: 'large VPS (8 vCPU · 32 GiB)', cores: 8, memoryBytes: 32 * GIB, gpus: 0 },
  { name: 'dedicated box (16 cores · 64 GiB)', cores: 16, memoryBytes: 64 * GIB, gpus: 0 },
  {
    name: 'GPU workstation (24 cores · 128 GiB · 1 GPU)',
    cores: 24,
    memoryBytes: 128 * GIB,
    gpus: 1,
  },
  {
    name: 'dual-socket server (64 cores · 512 GiB · 4 GPUs)',
    cores: 64,
    memoryBytes: 512 * GIB,
    gpus: 4,
  },
]

type TierForPlacement = Pick<BillingTier, 'id' | 'label' | 'rank' | 'isCustom' | 'entitlements'>

/**
 * The lowest purchasable tier whose ceilings cover the shape, or `null`
 * when only a custom tier would — the same "smallest tier that fits" rule
 * the sizing hint tells the operator to apply by hand. A tier without
 * ladder entitlements cannot place anything and is skipped.
 */
export function lowestTierFor<T extends TierForPlacement>(
  shape: Pick<MachineExample, 'cores' | 'memoryBytes' | 'gpus'>,
  tiers: readonly T[]
): T | null {
  const ladder = tiers.filter((tier) => !tier.isCustom).sort((a, b) => a.rank - b.rank)
  return (
    ladder.find((tier) => {
      const fits = tier.entitlements
      return (
        fits != null &&
        fits.maxCores >= shape.cores &&
        fits.maxMemoryBytes >= shape.memoryBytes &&
        fits.gpuSlots >= shape.gpus
      )
    }) ?? null
  )
}

/** The examples that land on exactly this tier, in ladder order. */
export function machineExamplesForTier(
  tier: Pick<BillingTier, 'id'>,
  tiers: readonly TierForPlacement[],
  examples: readonly MachineExample[] = MACHINE_EXAMPLES
): MachineExample[] {
  return examples.filter((example) => lowestTierFor(example, tiers)?.id === tier.id)
}

/** `e.g. Raspberry Pi 5, small VPS (2 vCPU · 4 GiB)`; empty when nothing familiar lands here. */
export function formatMachineExamples(examples: readonly MachineExample[]): string {
  if (examples.length === 0) return ''
  return `e.g. ${examples.map((example) => example.name).join(', ')}`
}
