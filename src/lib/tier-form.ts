/**
 * Pure helpers for Admin → Tiers.
 *
 * The screen is one row per ladder label. Entitlements and the list price
 * come from the in-code ladder and are read-only; the only thing the
 * operator decides is which provider product a label bills against, picked
 * from `GET /tiers/products`. The server verifies the pick again before
 * writing — nothing here is a security boundary.
 */

import type {
  AdminLadderEntry,
  AdminTier,
  AdminTierProduct,
  AdminTierVerification,
  AdminTierVerifyAllResult,
} from '@/lib/instance-api'
import type { SelectOption } from '@/lib/select-options'

const GIB = 1024 ** 3
const TIB = 1024 ** 4

/** `$10.00`, or an em dash for a negotiated row with no price. */
export function formatPrice(cents: number | null, currency: string | null = 'usd'): string {
  if (cents === null) return '—'
  const code = (currency ?? 'usd').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`
  }
}

/**
 * Byte ceilings as the ladder means them. SX's sentinel is
 * `Number.MAX_SAFE_INTEGER`, which would otherwise render as a meaningless
 * eight-petabyte figure.
 */
export function formatMemory(bytes: number): string {
  if (bytes >= Number.MAX_SAFE_INTEGER) return 'Unbounded'
  if (bytes >= TIB && bytes % TIB === 0) return `${bytes / TIB} TiB`
  if (bytes % GIB === 0) return `${bytes / GIB} GiB`
  return `${(bytes / GIB).toFixed(1)} GiB`
}

export function formatCores(cores: number): string {
  return cores >= 2_147_483_647 ? 'Unbounded' : `${cores}`
}

/** `2 NIC · 6 drive · 2 GPU · 9 fs` — the slot budget on one line. */
export function formatSlots(entitlements: Readonly<{
  nicSlots: number
  driveSlots: number
  gpuSlots: number
  filesystemSlots: number
}>): string {
  return [
    `${entitlements.nicSlots} NIC`,
    `${entitlements.driveSlots} drive`,
    `${entitlements.gpuSlots} GPU`,
    `${entitlements.filesystemSlots} fs`,
  ].join(' · ')
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** How many things point at a row: organizations buying at it, servers assigned it. */
export function referenceSummary(tier: AdminTier): string {
  const { seats, servers } = tier.references
  if (seats === 0 && servers === 0) return 'Unused'
  const parts: string[] = []
  if (seats > 0) parts.push(`bought by ${plural(seats, 'organization', 'organizations')}`)
  if (servers > 0) parts.push(`on ${plural(servers, 'server', 'servers')}`)
  return parts.join(' · ')
}

export type VerifyBadge = Readonly<{
  label: string
  tone: 'ok' | 'danger' | 'muted' | 'pending'
}>

/**
 * The badge beside a product. "Not checked" is deliberately `muted` and not
 * a failure: a row is verified when it is written, and the badge only
 * reports what *this* page has since confirmed.
 */
export function verifyBadge(
  tier: AdminTier | null,
  verification: AdminTierVerification | undefined,
  busy: boolean,
): VerifyBadge {
  if (busy) return { label: 'Checking…', tone: 'pending' }
  if (!tier) return { label: 'Not set up', tone: 'muted' }
  if (tier.isCustom) return { label: 'Negotiated', tone: 'muted' }
  if (!tier.providerProductId) return { label: 'No product', tone: 'muted' }
  if (!verification) return { label: 'Not checked', tone: 'muted' }
  return verification.ok
    ? { label: 'Verified', tone: 'ok' }
    : { label: plural(verification.failures.length, 'problem', 'problems'), tone: 'danger' }
}

/** `$10.00 / month`, `$25.00 every 3 months`, or `No price` for an unsellable product. */
export function formatProductPrice(product: Pick<AdminTierProduct, 'defaultPrice'>): string {
  const price = product.defaultPrice
  if (price?.unitAmount == null) return 'No price'
  const amount = formatPrice(price.unitAmount, price.currency)
  if (!price.interval) return amount
  const count = price.intervalCount ?? 1
  return count > 1 ? `${amount} every ${count} ${price.interval}s` : `${amount} / ${price.interval}`
}

/** Which tier row a product is already bound to, when it is not this one. */
export function boundElsewhere(product: Pick<AdminTierProduct, 'tierId'>, rowTierId: string | null): boolean {
  return product.tierId !== null && product.tierId !== rowTierId
}

/**
 * One dropdown row: name and price on the label, the verification verdict
 * (with every failure reason) on the detail line. A product another tier
 * already bills against is visible but unselectable — two labels cannot
 * share a product.
 */
export function productOption(product: AdminTierProduct, rowTierId: string | null): SelectOption {
  const verdict = product.verification.ok
    ? '✓ verified'
    : `✗ ${product.verification.failures.join('; ')}`
  const taken = boundElsewhere(product, rowTierId)
  const detailParts = [verdict]
  if (taken) detailParts.push('bound to another tier')
  if (!product.livemode) detailParts.push('test mode')
  return {
    value: product.id,
    label: `${product.name} · ${formatProductPrice(product)}`,
    detail: detailParts.join(' · '),
    disabled: taken,
  }
}

/** Every product as an option, verified ones first, then by name. */
export function productOptions(
  products: readonly AdminTierProduct[],
  rowTierId: string | null,
): SelectOption[] {
  return [...products]
    .sort((a, b) => {
      if (a.verification.ok !== b.verification.ok) return a.verification.ok ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((product) => productOption(product, rowTierId))
}

/**
 * The product to preselect for a label: the one whose metadata names it,
 * not already taken by another row, verified ones winning. `null` when
 * nothing on the provider names this label.
 */
export function suggestedProductId(
  products: readonly AdminTierProduct[],
  label: string,
  rowTierId: string | null,
): string | null {
  const candidates = products.filter(
    (product) => product.suggestedLabel === label && !boundElsewhere(product, rowTierId),
  )
  return candidates.find((product) => product.verification.ok)?.id ?? candidates[0]?.id ?? null
}

export type LadderRow = Readonly<{
  entry: AdminLadderEntry
  /** The row bound to this label, or `null` while it is still to be set up. */
  tier: AdminTier | null
}>

/** The ladder in rank order, each rung paired with its row when one exists. */
export function ladderRows(
  ladder: readonly AdminLadderEntry[],
  tiers: readonly AdminTier[],
): LadderRow[] {
  const byId = new Map(tiers.map((tier) => [tier.id, tier]))
  return [...ladder]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => ({ entry, tier: entry.tierId ? (byId.get(entry.tierId) ?? null) : null }))
}

/** What the row currently bills against — the product the dropdown should show as selected. */
export function initialProductId(row: LadderRow, products: readonly AdminTierProduct[]): string | null {
  if (row.tier?.providerProductId) return row.tier.providerProductId
  if (row.entry.isCustom) return null
  return suggestedProductId(products, row.entry.label, row.tier?.id ?? null)
}

/** Whether pressing Save would change anything: a new row, or a different product on an existing one. */
export function hasPendingBinding(row: LadderRow, productId: string | null): boolean {
  if (row.entry.isCustom) return row.tier === null
  if (!productId) return false
  return row.tier?.providerProductId !== productId
}

/** "Verify all" results keyed by row id, in the shape the per-row badge reads. */
export function verificationsById(
  results: readonly AdminTierVerifyAllResult[],
): Record<string, AdminTierVerification> {
  const out: Record<string, AdminTierVerification> = {}
  for (const entry of results) {
    out[entry.id] = { ok: entry.ok, failures: entry.failures, product: entry.product }
  }
  return out
}

/** How many rows reported a problem. */
export function failingCount(verifications: Readonly<Record<string, AdminTierVerification>>): number {
  return Object.values(verifications).filter((entry) => !entry.ok).length
}
