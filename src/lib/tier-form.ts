/**
 * Pure helpers for the admin tier catalogue form.
 *
 * The form's job is narrow and worth stating: a superadmin creates a Product
 * and a Price in the Stripe Dashboard by hand, then enters the row here. Every
 * field except the Stripe price id is derivable from the shipped ladder, so
 * the form prefills all of them and asks for the one it cannot know.
 *
 * Everything here is display-side. The server re-validates and verifies
 * against Stripe before writing; nothing in this file is a security boundary.
 */

import type {
  AdminTier,
  AdminTierCreateBody,
  AdminTierDefaultEntry,
  AdminTierDefaults,
  AdminTierVerification,
} from '@/lib/instance-api'

const GIB = 1024 ** 3
const TIB = 1024 ** 4

/** `$10.00`, or an em dash for a negotiated row with no list price. */
export function formatPrice(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(2)}`
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

/** How many things point at a row — what decides whether it is still editable. */
export function referenceSummary(tier: AdminTier): string {
  const { licenses, seats } = tier.references
  if (licenses === 0 && seats === 0) return 'Unused'
  const parts: string[] = []
  if (licenses > 0) parts.push(`${licenses} licence${licenses === 1 ? '' : 's'}`)
  if (seats > 0) parts.push(`${seats} seat row${seats === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

export type VerifyBadge = Readonly<{
  label: string
  tone: 'ok' | 'danger' | 'muted' | 'pending'
}>

/**
 * The badge beside a price id. "Not checked" is deliberately `muted` and not
 * a failure: a row is verified when it is written, and the badge only reports
 * what *this* page has since confirmed.
 */
export function verifyBadge(
  tier: AdminTier,
  verification: AdminTierVerification | undefined,
  busy: boolean,
): VerifyBadge {
  if (busy) return { label: 'Checking…', tone: 'pending' }
  if (!tier.providerPriceId) return { label: 'No price', tone: 'muted' }
  if (!verification) return { label: 'Not checked', tone: 'muted' }
  return verification.ok
    ? { label: 'Verified', tone: 'ok' }
    : { label: `${verification.failures.length} problem${verification.failures.length === 1 ? '' : 's'}`, tone: 'danger' }
}

/**
 * What the operator must create in the Stripe Dashboard for this tier,
 * phrased in the Dashboard's own words so the two screens read alike. This
 * is the whole point of the form: it should be obvious that the row here and
 * the Price there are the same object seen twice.
 */
export type StripeRecipe = Readonly<{
  productName: string
  amount: string
  interval: string
  billing: string
  currency: string
  taxBehaviour: string
}>

export function stripeRecipe(entry: Readonly<{ label: string; priceCents: number | null }>): StripeRecipe | null {
  if (entry.priceCents === null) return null
  return {
    productName: `TurboPanel ${entry.label} server seat`,
    amount: formatPrice(entry.priceCents),
    interval: 'Monthly (recurring)',
    billing: 'Per unit — one seat is one quantity',
    currency: 'USD',
    taxBehaviour: 'Inclusive or exclusive — never "unspecified"',
  }
}

export type TierFormState = Readonly<{
  generation: string
  label: string
  rank: string
  priceCents: string
  providerPriceId: string
  isCustom: boolean
  maxCores: string
  maxMemoryBytes: string
  nicSlots: string
  driveSlots: string
  gpuSlots: string
  filesystemSlots: string
}>

/**
 * Prefill every field from one ladder entry, leaving the Stripe price id
 * empty — the one thing the operator has to fetch from the Dashboard.
 */
export function formStateFromDefault(
  entry: AdminTierDefaultEntry,
  generation: number,
): TierFormState {
  return {
    generation: String(generation),
    label: entry.label,
    rank: String(entry.rank),
    priceCents: entry.priceCents === null ? '' : String(entry.priceCents),
    providerPriceId: '',
    isCustom: entry.isCustom,
    maxCores: String(entry.maxCores),
    maxMemoryBytes: String(entry.maxMemoryBytes),
    nicSlots: String(entry.nicSlots),
    driveSlots: String(entry.driveSlots),
    gpuSlots: String(entry.gpuSlots),
    filesystemSlots: String(entry.filesystemSlots),
  }
}

export function emptyFormState(generation: number): TierFormState {
  return {
    generation: String(generation),
    label: '',
    rank: '',
    priceCents: '',
    providerPriceId: '',
    isCustom: false,
    maxCores: '',
    maxMemoryBytes: '',
    nicSlots: '',
    driveSlots: '',
    gpuSlots: '',
    filesystemSlots: '',
  }
}

function toInt(value: string): number {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * Form state → request body. Numbers that will not parse become `NaN`, which
 * {@link localFormProblems} reports by field name; the request is not sent
 * while any problem stands.
 */
export function createBodyFromForm(state: TierFormState): AdminTierCreateBody {
  const priceId = state.providerPriceId.trim()
  return {
    generation: toInt(state.generation),
    label: state.label.trim(),
    rank: toInt(state.rank),
    priceCents: state.isCustom || state.priceCents.trim() === '' ? null : toInt(state.priceCents),
    providerPriceId: state.isCustom || priceId === '' ? null : priceId,
    isCustom: state.isCustom,
    maxCores: toInt(state.maxCores),
    maxMemoryBytes: toInt(state.maxMemoryBytes),
    nicSlots: toInt(state.nicSlots),
    driveSlots: toInt(state.driveSlots),
    gpuSlots: toInt(state.gpuSlots),
    filesystemSlots: toInt(state.filesystemSlots),
  }
}

function labelProblems(label: string, defaults: AdminTierDefaults | undefined): string[] {
  if (label.length === 0) return ['Label is required']
  if (defaults && !new RegExp(defaults.labelPattern).test(label)) {
    return [`Label must be S1…S99 or SX (got ${label})`]
  }
  return []
}

function numberProblems(body: AdminTierCreateBody): string[] {
  const numbers: [string, number][] = [
    ['Generation', body.generation],
    ['Rank', body.rank],
    ['Max cores', body.maxCores],
    ['Max memory', body.maxMemoryBytes],
    ['NIC slots', body.nicSlots],
    ['Drive slots', body.driveSlots],
    ['GPU slots', body.gpuSlots],
    ['Filesystem slots', body.filesystemSlots],
  ]
  return numbers
    .filter(([, value]) => !Number.isFinite(value))
    .map(([name]) => `${name} must be a number`)
}

/** A custom tier carries no Stripe price; a priced tier needs both halves. */
function pricingProblems(state: TierFormState, body: AdminTierCreateBody): string[] {
  const out: string[] = []
  if (body.isCustom) {
    if (state.priceCents.trim() !== '') out.push('A custom tier has no list price')
    if (state.providerPriceId.trim() !== '') out.push('A custom tier has no Stripe price id')
    return out
  }
  if (body.priceCents === null || !Number.isFinite(body.priceCents)) {
    out.push('Price in cents is required for a priced tier')
  }
  if (body.providerPriceId === null) out.push('Stripe price id is required for a priced tier')
  else if (!body.providerPriceId.startsWith('price_')) {
    out.push('Stripe price id should start with price_')
  }
  return out
}

function slotCeilingProblems(body: AdminTierCreateBody, defaults: AdminTierDefaults | undefined): string[] {
  if (!defaults) return []
  const ceilings = defaults.slotCeilings
  const slots: [string, number, number][] = [
    ['NIC slots', body.nicSlots, ceilings.nicSlots],
    ['Drive slots', body.driveSlots, ceilings.driveSlots],
    ['GPU slots', body.gpuSlots, ceilings.gpuSlots],
    ['Filesystem slots', body.filesystemSlots, ceilings.filesystemSlots],
  ]
  return slots
    .filter(([, value, ceiling]) => Number.isFinite(value) && value > ceiling)
    .map(([name, , ceiling]) => `${name} cannot exceed ${ceiling}`)
}

/**
 * The subset of the server's rules worth checking before a round trip —
 * empty and unparseable fields. The server owns the real ruleset (and the
 * Stripe verification); this only avoids obviously wasted requests.
 */
export function localFormProblems(
  state: TierFormState,
  defaults: AdminTierDefaults | undefined,
): string[] {
  const body = createBodyFromForm(state)
  return [
    ...labelProblems(body.label, defaults),
    ...numberProblems(body),
    ...pricingProblems(state, body),
    ...slotCeilingProblems(body, defaults),
  ]
}

/** Rows in the order the catalogue reads: generation, then rank. */
export function sortTiers(tiers: readonly AdminTier[]): AdminTier[] {
  return [...tiers].sort((a, b) =>
    a.generation === b.generation ? a.rank - b.rank : a.generation - b.generation
  )
}

/** The highest generation present, or 1 when the catalogue is empty. */
export function currentGeneration(tiers: readonly AdminTier[]): number {
  return tiers.reduce((highest, row) => Math.max(highest, row.generation), 1)
}

/** Ladder entries not yet present in this generation — what "Add from defaults" offers. */
export function availableDefaults(
  defaults: AdminTierDefaults | undefined,
  tiers: readonly AdminTier[],
  generation: number,
): AdminTierDefaultEntry[] {
  if (!defaults) return []
  const taken = new Set(
    tiers.filter((row) => row.generation === generation).map((row) => row.label)
  )
  return defaults.tiers.filter((entry) => !taken.has(entry.label))
}
