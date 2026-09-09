import { describe, expect, it } from 'vitest'
import type { AdminLadderEntry, AdminTier, AdminTierProduct } from '@/lib/instance-api'
import {
  boundElsewhere,
  failingCount,
  formatCores,
  formatMemory,
  formatPrice,
  formatProductPrice,
  formatSlots,
  hasPendingBinding,
  initialProductId,
  ladderRows,
  productOption,
  productOptions,
  referenceSummary,
  suggestedProductId,
  verificationsById,
  verifyBadge,
} from '@/lib/tier-form'

const GIB = 1024 ** 3

const ENTITLEMENTS = {
  maxCores: 16,
  maxMemoryBytes: 64 * GIB,
  nicSlots: 5,
  driveSlots: 6,
  gpuSlots: 2,
  filesystemSlots: 9,
}

function tier(overrides: Partial<AdminTier> = {}): AdminTier {
  return {
    id: 't-3',
    label: 'S3',
    rank: 3,
    provider: 'stripe',
    providerProductId: 'prod_s3',
    priceCents: 1000,
    currency: 'usd',
    isCustom: false,
    isActive: true,
    entitlements: ENTITLEMENTS,
    references: { seats: 0, servers: 0 },
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

function product(overrides: Partial<AdminTierProduct> = {}): AdminTierProduct {
  return {
    id: 'prod_s3',
    name: 'TurboPanel S3',
    active: true,
    livemode: true,
    suggestedLabel: 'S3',
    defaultPrice: {
      id: 'price_s3',
      active: true,
      currency: 'usd',
      unitAmount: 1000,
      interval: 'month',
      intervalCount: 1,
      billingScheme: 'per_unit',
      taxBehavior: 'exclusive',
    },
    verification: { ok: true, failures: [] },
    tierId: null,
    ...overrides,
  }
}

const ladder: AdminLadderEntry[] = [
  { label: 'SX', rank: 8, isCustom: true, listPriceCents: null, entitlements: ENTITLEMENTS, tierId: null },
  { label: 'S3', rank: 3, isCustom: false, listPriceCents: 1000, entitlements: ENTITLEMENTS, tierId: 't-3' },
  { label: 'S1', rank: 1, isCustom: false, listPriceCents: 500, entitlements: ENTITLEMENTS, tierId: null },
]

describe('formatting', () => {
  it('renders prices in the row currency, and an em dash for a negotiated row', () => {
    expect(formatPrice(1000)).toBe('$10.00')
    expect(formatPrice(500, 'usd')).toBe('$5.00')
    expect(formatPrice(500, null)).toBe('$5.00')
    expect(formatPrice(500, 'nope!')).toBe('5.00 NOPE!')
    expect(formatPrice(null)).toBe('—')
  })

  it('renders SX sentinels as "Unbounded" rather than an absurd figure', () => {
    expect(formatMemory(Number.MAX_SAFE_INTEGER)).toBe('Unbounded')
    expect(formatCores(2_147_483_647)).toBe('Unbounded')
    expect(formatMemory(64 * GIB)).toBe('64 GiB')
    expect(formatMemory(1024 * GIB)).toBe('1 TiB')
    expect(formatMemory(1.5 * GIB)).toBe('1.5 GiB')
    expect(formatCores(16)).toBe('16')
  })

  it('puts the slot budget on one line', () => {
    expect(formatSlots(ENTITLEMENTS)).toBe('5 NIC · 6 drive · 2 GPU · 9 fs')
  })

  it('summarises what points at a row without saying seat', () => {
    expect(referenceSummary(tier())).toBe('Unused')
    expect(referenceSummary(tier({ references: { seats: 1, servers: 0 } }))).toBe(
      'bought by 1 organization'
    )
    expect(referenceSummary(tier({ references: { seats: 3, servers: 2 } }))).toBe(
      'bought by 3 organizations · on 2 servers'
    )
    expect(referenceSummary(tier({ references: { seats: 0, servers: 1 } }))).toBe('on 1 server')
  })

  it('renders a product price with its interval', () => {
    expect(formatProductPrice(product())).toBe('$10.00 / month')
    expect(
      formatProductPrice(
        product({ defaultPrice: { ...product().defaultPrice!, intervalCount: 3 } })
      )
    ).toBe('$10.00 every 3 months')
    expect(
      formatProductPrice(product({ defaultPrice: { ...product().defaultPrice!, interval: null } }))
    ).toBe('$10.00')
    expect(formatProductPrice(product({ defaultPrice: null }))).toBe('No price')
    expect(
      formatProductPrice(product({ defaultPrice: { ...product().defaultPrice!, unitAmount: null } }))
    ).toBe('No price')
  })
})

describe('verifyBadge', () => {
  it('reports not-checked as neutral, never as a failure', () => {
    expect(verifyBadge(tier(), undefined, false)).toEqual({ label: 'Not checked', tone: 'muted' })
  })

  it('reports a verified product and a failing one', () => {
    expect(verifyBadge(tier(), { ok: true, failures: [], product: null }, false)).toEqual({
      label: 'Verified',
      tone: 'ok',
    })
    expect(verifyBadge(tier(), { ok: false, failures: ['a', 'b'], product: null }, false)).toEqual({
      label: '2 problems',
      tone: 'danger',
    })
    expect(verifyBadge(tier(), { ok: false, failures: ['a'], product: null }, false).label).toBe(
      '1 problem'
    )
  })

  it('says so while checking, for a missing row, a negotiated row, and a row with no product', () => {
    expect(verifyBadge(tier(), undefined, true).label).toBe('Checking…')
    expect(verifyBadge(null, undefined, false)).toEqual({ label: 'Not set up', tone: 'muted' })
    expect(verifyBadge(tier({ isCustom: true, providerProductId: null }), undefined, false)).toEqual({
      label: 'Negotiated',
      tone: 'muted',
    })
    expect(verifyBadge(tier({ providerProductId: null }), undefined, false)).toEqual({
      label: 'No product',
      tone: 'muted',
    })
  })
})

describe('product options', () => {
  it('shows name, price and the verdict, and blocks a product another tier uses', () => {
    expect(productOption(product(), 't-3')).toEqual({
      value: 'prod_s3',
      label: 'TurboPanel S3 · $10.00 / month',
      detail: '✓ verified',
      disabled: false,
    })
    const failing = product({
      id: 'prod_bad',
      livemode: false,
      verification: { ok: false, failures: ['no default price', 'not monthly'] },
      tierId: 't-9',
    })
    expect(productOption(failing, 't-3')).toEqual({
      value: 'prod_bad',
      label: 'TurboPanel S3 · $10.00 / month',
      detail: '✗ no default price; not monthly · bound to another tier · test mode',
      disabled: true,
    })
    // The row's own product is never "taken".
    expect(boundElsewhere(product({ tierId: 't-3' }), 't-3')).toBe(false)
    expect(boundElsewhere(product({ tierId: 't-3' }), null)).toBe(true)
  })

  it('lists verified products first, then by name', () => {
    const out = productOptions(
      [
        product({ id: 'z', name: 'Zed', verification: { ok: false, failures: ['x'] } }),
        product({ id: 'b', name: 'Bee' }),
        product({ id: 'a', name: 'Ay' }),
      ],
      null
    )
    expect(out.map((option) => option.value)).toEqual(['a', 'b', 'z'])
  })

  it('preselects the product whose metadata names the label, verified and free ones first', () => {
    const products = [
      product({ id: 'taken', suggestedLabel: 'S3', tierId: 't-other' }),
      product({ id: 'broken', suggestedLabel: 'S3', verification: { ok: false, failures: ['x'] } }),
      product({ id: 'good', suggestedLabel: 'S3' }),
      product({ id: 'other', suggestedLabel: 'S1' }),
    ]
    expect(suggestedProductId(products, 'S3', null)).toBe('good')
    expect(suggestedProductId(products.slice(0, 2), 'S3', null)).toBe('broken')
    expect(suggestedProductId(products, 'S7', null)).toBeNull()
    // The row's own binding counts as free.
    expect(suggestedProductId([products[0]!], 'S3', 't-other')).toBe('taken')
  })
})

describe('ladder rows', () => {
  it('pairs each rung with its row in rank order', () => {
    const rows = ladderRows(ladder, [tier()])
    expect(rows.map((row) => row.entry.label)).toEqual(['S1', 'S3', 'SX'])
    expect(rows[1]!.tier?.id).toBe('t-3')
    expect(rows[0]!.tier).toBeNull()
    expect(rows[2]!.tier).toBeNull()
  })

  it('starts the dropdown on the bound product, else the suggestion, and nothing for SX', () => {
    const rows = ladderRows(ladder, [tier({ providerProductId: 'prod_custom' })])
    const products = [product({ id: 'prod_s1', suggestedLabel: 'S1' }), product()]
    expect(initialProductId(rows[1]!, products)).toBe('prod_custom')
    expect(initialProductId(rows[0]!, products)).toBe('prod_s1')
    expect(initialProductId(rows[2]!, products)).toBeNull()
  })

  it('knows when Save would change something', () => {
    const rows = ladderRows(ladder, [tier()])
    expect(hasPendingBinding(rows[0]!, 'prod_s1')).toBe(true)
    expect(hasPendingBinding(rows[0]!, null)).toBe(false)
    expect(hasPendingBinding(rows[1]!, 'prod_s3')).toBe(false)
    expect(hasPendingBinding(rows[1]!, 'prod_other')).toBe(true)
    // SX has no product: saving only creates the row.
    expect(hasPendingBinding(rows[2]!, null)).toBe(true)
    expect(hasPendingBinding({ entry: ladder[0]!, tier: tier({ isCustom: true }) }, null)).toBe(false)
  })
})

describe('verify all', () => {
  it('keys results by row and counts the failures', () => {
    const map = verificationsById([
      { id: 'a', label: 'S1', ok: true, failures: [], product: null },
      { id: 'b', label: 'S2', ok: false, failures: ['gone'], product: null },
    ])
    expect(map.a).toEqual({ ok: true, failures: [], product: null })
    expect(map.b?.failures).toEqual(['gone'])
    expect(failingCount(map)).toBe(1)
    expect(failingCount({})).toBe(0)
  })
})
