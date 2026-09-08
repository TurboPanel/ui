import { describe, expect, it } from 'vitest'
import type { AdminTier, AdminTierDefaults } from '@/lib/instance-api'
import {
  availableDefaults,
  createBodyFromForm,
  currentGeneration,
  emptyFormState,
  formatCores,
  formatMemory,
  formatPrice,
  formatSlots,
  formStateFromDefault,
  localFormProblems,
  referenceSummary,
  sortTiers,
  stripeRecipe,
  verifyBadge,
} from '@/lib/tier-form'

const GIB = 1024 ** 3

function tier(overrides: Partial<AdminTier> = {}): AdminTier {
  return {
    id: 't-3',
    generation: 1,
    rank: 3,
    label: 'S3',
    priceCents: 1000,
    providerPriceId: 'price_s3',
    isCustom: false,
    isActive: true,
    successorId: null,
    entitlements: {
      maxCores: 16,
      maxMemoryBytes: 64 * GIB,
      nicSlots: 5,
      driveSlots: 6,
      gpuSlots: 2,
      filesystemSlots: 9,
    },
    references: { licenses: 0, seats: 0 },
    entitlementsEditable: true,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

const defaults: AdminTierDefaults = {
  labelPattern: '^S(?:[1-9][0-9]?|X)$',
  currency: 'usd',
  slotCeilings: { nicSlots: 11, driveSlots: 24, gpuSlots: 8, filesystemSlots: 18 },
  unbounded: { maxCores: 2_147_483_647, maxMemoryBytes: Number.MAX_SAFE_INTEGER },
  placementBands: {
    maxCores: [4, 10, 16, 32, 64, 128, 256],
    maxMemoryBytes: [16 * GIB, 32 * GIB, 64 * GIB],
    nicSlots: [2, 2, 5, 5, 8, 8, 11],
  },
  tiers: [
    {
      label: 'S3',
      rank: 3,
      priceCents: 1000,
      isCustom: false,
      maxCores: 16,
      maxMemoryBytes: 64 * GIB,
      nicSlots: 5,
      driveSlots: 6,
      gpuSlots: 2,
      filesystemSlots: 9,
    },
    {
      label: 'SX',
      rank: 8,
      priceCents: null,
      isCustom: true,
      maxCores: 2_147_483_647,
      maxMemoryBytes: Number.MAX_SAFE_INTEGER,
      nicSlots: 11,
      driveSlots: 24,
      gpuSlots: 8,
      filesystemSlots: 18,
    },
  ],
}

describe('formatting', () => {
  it('renders prices, and an em dash for a negotiated row', () => {
    expect(formatPrice(1000)).toBe('$10.00')
    expect(formatPrice(500)).toBe('$5.00')
    expect(formatPrice(null)).toBe('—')
  })

  it('renders SX sentinels as "Unbounded" rather than an absurd figure', () => {
    expect(formatMemory(Number.MAX_SAFE_INTEGER)).toBe('Unbounded')
    expect(formatCores(2_147_483_647)).toBe('Unbounded')
    expect(formatMemory(64 * GIB)).toBe('64 GiB')
    expect(formatMemory(1024 * GIB)).toBe('1 TiB')
    expect(formatCores(16)).toBe('16')
  })

  it('puts the slot budget on one line', () => {
    expect(formatSlots({ nicSlots: 5, driveSlots: 6, gpuSlots: 2, filesystemSlots: 9 })).toBe(
      '5 NIC · 6 drive · 2 GPU · 9 fs'
    )
  })

  it('summarises what points at a row', () => {
    expect(referenceSummary(tier())).toBe('Unused')
    expect(referenceSummary(tier({ references: { licenses: 1, seats: 0 } }))).toBe('1 licence')
    expect(referenceSummary(tier({ references: { licenses: 3, seats: 2 } }))).toBe(
      '3 licences · 2 seat rows'
    )
  })
})

describe('verifyBadge', () => {
  it('reports not-checked as neutral, never as a failure', () => {
    expect(verifyBadge(tier(), undefined, false)).toEqual({ label: 'Not checked', tone: 'muted' })
  })

  it('reports a verified price and a failing one', () => {
    expect(verifyBadge(tier(), { ok: true, failures: [], price: null }, false)).toEqual({
      label: 'Verified',
      tone: 'ok',
    })
    expect(
      verifyBadge(tier(), { ok: false, failures: ['a', 'b'], price: null }, false)
    ).toEqual({ label: '2 problems', tone: 'danger' })
    expect(verifyBadge(tier(), { ok: false, failures: ['a'], price: null }, false).label).toBe(
      '1 problem'
    )
  })

  it('says so while checking, and when there is no price to check', () => {
    expect(verifyBadge(tier(), undefined, true).label).toBe('Checking…')
    expect(verifyBadge(tier({ providerPriceId: null }), undefined, false)).toEqual({
      label: 'No price',
      tone: 'muted',
    })
  })
})

describe('stripeRecipe', () => {
  it('spells out what to create in Stripe, in the Dashboard’s own terms', () => {
    const recipe = stripeRecipe({ label: 'S3', priceCents: 1000 })
    expect(recipe).toEqual({
      productName: 'TurboPanel S3 server seat',
      amount: '$10.00',
      interval: 'Monthly (recurring)',
      billing: 'Per unit — one seat is one quantity',
      currency: 'USD',
      taxBehaviour: 'Inclusive or exclusive — never "unspecified"',
    })
  })

  it('has nothing to say for a negotiated tier', () => {
    expect(stripeRecipe({ label: 'SX', priceCents: null })).toBeNull()
  })
})

describe('form state', () => {
  it('prefills every field except the price id', () => {
    const state = formStateFromDefault(defaults.tiers[0]!, 1)
    expect(state.label).toBe('S3')
    expect(state.priceCents).toBe('1000')
    expect(state.maxCores).toBe('16')
    expect(state.nicSlots).toBe('5')
    // The one thing the operator has to fetch from Stripe.
    expect(state.providerPriceId).toBe('')
  })

  it('prefills SX as custom and unpriced', () => {
    const state = formStateFromDefault(defaults.tiers[1]!, 1)
    expect(state.isCustom).toBe(true)
    expect(state.priceCents).toBe('')
  })

  it('turns form state into a request body, trimming the price id', () => {
    const state = { ...formStateFromDefault(defaults.tiers[0]!, 2), providerPriceId: '  price_abc  ' }
    const body = createBodyFromForm(state)
    expect(body.generation).toBe(2)
    expect(body.providerPriceId).toBe('price_abc')
    expect(body.priceCents).toBe(1000)
    expect(body.isCustom).toBe(false)
  })

  it('sends nulls, not empty strings, for a custom row', () => {
    const body = createBodyFromForm(formStateFromDefault(defaults.tiers[1]!, 1))
    expect(body.priceCents).toBeNull()
    expect(body.providerPriceId).toBeNull()
  })
})

describe('localFormProblems', () => {
  const filled = (over: Partial<ReturnType<typeof emptyFormState>> = {}) => ({
    ...formStateFromDefault(defaults.tiers[0]!, 1),
    providerPriceId: 'price_s3',
    ...over,
  })

  it('passes a complete priced row', () => {
    expect(localFormProblems(filled(), defaults)).toEqual([])
  })

  it('requires a price id on a priced row and refuses one that is not a price id', () => {
    expect(localFormProblems(filled({ providerPriceId: '' }), defaults)).toContain(
      'Stripe price id is required for a priced tier'
    )
    expect(localFormProblems(filled({ providerPriceId: 'prod_x' }), defaults)).toContain(
      'Stripe price id should start with price_'
    )
  })

  it('refuses a price or a price id on a custom row', () => {
    const custom = { ...formStateFromDefault(defaults.tiers[1]!, 1), providerPriceId: 'price_x' }
    expect(localFormProblems(custom, defaults)).toContain('A custom tier has no Stripe price id')
  })

  it('refuses a label outside the pattern and a slot count over the ceiling', () => {
    expect(localFormProblems(filled({ label: 'Gold' }), defaults)).toContain(
      'Label must be S1…S99 or SX (got Gold)'
    )
    expect(localFormProblems(filled({ nicSlots: '12' }), defaults)).toContain(
      'NIC slots cannot exceed 11'
    )
    expect(localFormProblems(filled({ driveSlots: '25' }), defaults)).toContain(
      'Drive slots cannot exceed 24'
    )
  })

  it('names unparseable numbers by field', () => {
    expect(localFormProblems(filled({ maxCores: 'lots' }), defaults)).toContain(
      'Max cores must be a number'
    )
  })
})

describe('catalogue ordering and defaults on offer', () => {
  it('sorts by generation then rank', () => {
    const rows = [
      tier({ id: 'a', generation: 2, rank: 1, label: 'S1' }),
      tier({ id: 'b', generation: 1, rank: 5, label: 'S5' }),
      tier({ id: 'c', generation: 1, rank: 1, label: 'S1' }),
    ]
    expect(sortTiers(rows).map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })

  it('reads the current generation as the highest present, and 1 when empty', () => {
    expect(currentGeneration([])).toBe(1)
    expect(currentGeneration([tier({ generation: 1 }), tier({ id: 'x', generation: 3 })])).toBe(3)
  })

  it('offers only ladder entries this generation does not already have', () => {
    expect(availableDefaults(defaults, [], 1).map((entry) => entry.label)).toEqual(['S3', 'SX'])
    expect(
      availableDefaults(defaults, [tier({ label: 'S3', generation: 1 })], 1).map((e) => e.label)
    ).toEqual(['SX'])
    // A row in another generation does not take the label here.
    expect(
      availableDefaults(defaults, [tier({ label: 'S3', generation: 2 })], 1).map((e) => e.label)
    ).toEqual(['S3', 'SX'])
  })

  it('offers nothing before the defaults have loaded', () => {
    expect(availableDefaults(undefined, [], 1)).toEqual([])
  })
})
