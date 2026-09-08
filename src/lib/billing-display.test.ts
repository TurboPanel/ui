import { describe, expect, it } from 'vitest'
import type {
  BillingPendingChange,
  BillingTier,
  OrgServerRecord,
  TierPlacementRecord,
} from '@/lib/instance-api'
import {
  describePendingChange,
  formatMachineExamples,
  formatMemoryLimit,
  formatMinorUnits,
  formatTierPrice,
  formatUnlicensedNeeds,
  isDelinquentSubscription,
  lowestTierFor,
  MACHINE_EXAMPLES,
  machineExamplesForTier,
  pendingChangeForLicense,
  subscriptionStatusView,
  summarizeFleetTierNeeds,
  tierChangeDirection,
  totalSeats,
} from './billing-display'
import { tierRankResolver } from './tier-placement'

describe('formatMinorUnits', () => {
  it('renders minor units in the given currency', () => {
    expect(formatMinorUnits(1999, 'usd')).toBe('$19.99')
    expect(formatMinorUnits(0, 'usd')).toBe('$0.00')
    expect(formatMinorUnits(-500, 'usd')).toBe('-$5.00')
  })

  it('degrades without a currency and hides missing amounts', () => {
    expect(formatMinorUnits(1234, null)).toBe('12.34')
    expect(formatMinorUnits(null, 'usd')).toBe('—')
    expect(formatMinorUnits(Number.NaN, 'usd')).toBe('—')
  })

  it('does not throw on a currency Intl rejects', () => {
    expect(formatMinorUnits(100, 'nope!')).toBe('1.00 NOPE!')
  })
})

describe('formatTierPrice / formatMemoryLimit', () => {
  it('prices numbered tiers per seat and defers custom ones', () => {
    expect(formatTierPrice({ priceCents: 4900, isCustom: false })).toBe('$49.00 / seat / month')
    expect(formatTierPrice({ priceCents: null, isCustom: false })).toBe('Contact us')
    expect(formatTierPrice({ priceCents: 1, isCustom: true })).toBe('Contact us')
  })

  it('formats memory ceilings in GiB', () => {
    expect(formatMemoryLimit(16 * 1024 ** 3)).toBe('16 GiB')
    expect(formatMemoryLimit(1.5 * 1024 ** 3)).toBe('1.5 GiB')
    expect(formatMemoryLimit(0)).toBe('—')
  })
})

describe('subscriptionStatusView / isDelinquentSubscription', () => {
  it('maps known provider statuses and passes unknown ones through', () => {
    expect(subscriptionStatusView('active')).toEqual({ label: 'Active', tone: 'ok' })
    expect(subscriptionStatusView('past_due')).toEqual({ label: 'Past due', tone: 'danger' })
    expect(subscriptionStatusView('canceled')).toEqual({ label: 'Canceled', tone: 'muted' })
    expect(subscriptionStatusView(null)).toEqual({ label: 'No subscription', tone: 'muted' })
    expect(subscriptionStatusView('paused')).toEqual({ label: 'paused', tone: 'muted' })
  })

  it('treats past_due and unpaid as delinquent, matching the control plane', () => {
    const at = (status: string) => ({
      status,
      currentPeriodEnd: null,
      pastDueSince: null,
      graceExpiresAt: null,
      scheduleAttached: false,
    })
    expect(isDelinquentSubscription(at('past_due'))).toBe(true)
    expect(isDelinquentSubscription(at('unpaid'))).toBe(true)
    expect(isDelinquentSubscription(at('active'))).toBe(false)
    expect(isDelinquentSubscription(at('canceled'))).toBe(false)
    expect(isDelinquentSubscription(null)).toBe(false)
  })
})

describe('tierChangeDirection', () => {
  it('compares ranks', () => {
    expect(tierChangeDirection(1, 3)).toBe('upgrade')
    expect(tierChangeDirection(3, 1)).toBe('downgrade')
    expect(tierChangeDirection(2, 2)).toBe('same')
    expect(tierChangeDirection(null, 2)).toBe('same')
  })
})

const tiers = [
  { id: 't1', label: 'S1' },
  { id: 't2', label: 'S2' },
]

function change(overrides: Partial<BillingPendingChange>): BillingPendingChange {
  return {
    id: 'i-1',
    kind: 'upgrade',
    licenseId: 'lic-1',
    fromTierId: 't1',
    toTierId: 't2',
    createdAt: '2026-09-01T00:00:00Z',
    expiresAt: null,
    ...overrides,
  }
}

describe('describePendingChange', () => {
  it('names the server when the license is bound and resolves tier labels', () => {
    expect(describePendingChange(change({}), tiers, () => 'edge-1')).toBe(
      'Upgrading edge-1 from S1 to S2 — applies once the payment is confirmed.'
    )
    expect(
      describePendingChange(change({ kind: 'downgrade', fromTierId: 't2', toTierId: 't1' }), tiers)
    ).toBe('Moving license lic-1 from S2 to S1 at the end of the current period.')
    expect(
      describePendingChange(
        change({ kind: 'release-seat', licenseId: null, toTierId: null }),
        tiers
      )
    ).toBe('Releasing a S1 seat at the end of the current period.')
  })

  it('falls back to raw ids for tiers missing from the catalogue', () => {
    expect(describePendingChange(change({ toTierId: 'gone' }), tiers)).toContain('to gone')
  })
})

describe('pendingChangeForLicense / totalSeats', () => {
  it('finds the change targeting a license', () => {
    const changes = [change({ licenseId: 'lic-2' }), change({ id: 'i-2', licenseId: 'lic-1' })]
    expect(pendingChangeForLicense(changes, 'lic-1')?.id).toBe('i-2')
    expect(pendingChangeForLicense(changes, 'lic-9')).toBeNull()
    expect(pendingChangeForLicense(changes, null)).toBeNull()
    expect(pendingChangeForLicense(undefined, 'lic-1')).toBeNull()
  })

  it('sums seats across tiers', () => {
    expect(
      totalSeats([
        { tierId: 't1', label: 'S1', seats: 3, licensesUsed: 2, licensesBound: 2, licensesFree: 1 },
        { tierId: 't2', label: 'S2', seats: 1, licensesUsed: 0, licensesBound: 0, licensesFree: 1 },
      ])
    ).toEqual({ seats: 4, used: 2, free: 2 })
    expect(totalSeats([])).toEqual({ seats: 0, used: 0, free: 0 })
  })
})

const GIB = 1024 ** 3

function ladderTier(
  label: string,
  rank: number,
  maxCores: number,
  maxGib: number,
  gpuSlots: number,
  isCustom = false
): BillingTier {
  return {
    id: `tier-${label}`,
    label,
    generation: 1,
    rank,
    priceCents: isCustom ? null : rank * 1000,
    isCustom,
    entitlements: {
      maxCores,
      maxMemoryBytes: maxGib * GIB,
      nicSlots: 2,
      driveSlots: 4,
      gpuSlots,
      filesystemSlots: 2,
    },
  }
}

const LADDER: BillingTier[] = [
  ladderTier('S1', 1, 4, 8, 0),
  ladderTier('S3', 3, 8, 32, 0),
  ladderTier('S5', 5, 32, 256, 2),
  ladderTier('SX', Number.MAX_SAFE_INTEGER, 1024, 4096, 16, true),
]

describe('machine examples', () => {
  it('places each shape in the lowest purchasable tier whose ceilings cover it', () => {
    expect(lowestTierFor({ cores: 4, memoryBytes: 8 * GIB, gpus: 0 }, LADDER)?.label).toBe('S1')
    expect(lowestTierFor({ cores: 4, memoryBytes: 16 * GIB, gpus: 0 }, LADDER)?.label).toBe('S3')
    expect(lowestTierFor({ cores: 24, memoryBytes: 128 * GIB, gpus: 1 }, LADDER)?.label).toBe('S5')
    // Only the custom tier would fit: nothing purchasable is offered.
    expect(lowestTierFor({ cores: 64, memoryBytes: 512 * GIB, gpus: 4 }, LADDER)).toBeNull()
    // A GPU forces the tier up even when cores and memory fit lower.
    expect(lowestTierFor({ cores: 2, memoryBytes: 4 * GIB, gpus: 1 }, LADDER)?.label).toBe('S5')
  })

  it('groups the fixed examples by the tier they land on, and follows the catalogue when ceilings move', () => {
    expect(machineExamplesForTier(LADDER[0]!, LADDER).map((e) => e.name)).toEqual([
      'Raspberry Pi 5',
      'small VPS (2 vCPU · 4 GiB)',
    ])
    expect(machineExamplesForTier(LADDER[1]!, LADDER).map((e) => e.name)).toEqual([
      'mid VPS (4 vCPU · 16 GiB)',
      'large VPS (8 vCPU · 32 GiB)',
    ])
    expect(machineExamplesForTier(LADDER[3]!, LADDER)).toEqual([])
    // Raise S1's RAM ceiling: the mid VPS moves down to it.
    const widened = [ladderTier('S1', 1, 4, 16, 0), ...LADDER.slice(1)]
    expect(machineExamplesForTier(widened[0]!, widened).map((e) => e.name)).toContain(
      'mid VPS (4 vCPU · 16 GiB)'
    )
    expect(MACHINE_EXAMPLES.length).toBeGreaterThanOrEqual(5)
  })

  it('formats the example line and hides it when nothing familiar lands on a tier', () => {
    expect(formatMachineExamples(MACHINE_EXAMPLES.slice(0, 2))).toBe(
      'e.g. Raspberry Pi 5, small VPS (2 vCPU · 4 GiB)'
    )
    expect(formatMachineExamples([])).toBe('')
  })
})

function fleetServer(
  id: string,
  placement: TierPlacementRecord | null,
  name: string | null = null
): OrgServerRecord {
  return {
    id,
    name,
    hostname: name ? null : `${id}.example`,
    tierPlacement: placement,
  } as unknown as OrgServerRecord
}

function placement(
  licenseTier: string | null,
  requiredTier: string,
  recommendedTier = requiredTier
): TierPlacementRecord {
  return {
    licenseTier,
    requiredTier,
    recommendedTier,
    unwatched: { nics: 0, drives: 0, gpus: 0 },
  } as unknown as TierPlacementRecord
}

describe('summarizeFleetTierNeeds', () => {
  const rankOf = tierRankResolver(LADDER)

  it('counts unlicensed servers by the tier the control plane recommends, in ladder order', () => {
    const needs = summarizeFleetTierNeeds(
      [
        fleetServer('a', placement(null, 'S3', 'S5')),
        fleetServer('b', placement(null, 'S1')),
        fleetServer('c', placement(null, 'S3', 'S5')),
        fleetServer('d', placement('S3', 'S3')),
      ],
      rankOf
    )
    expect(needs.total).toBe(4)
    expect(needs.unlicensed).toEqual([
      { tier: 'S1', count: 1 },
      { tier: 'S5', count: 2 },
    ])
    expect(needs.short).toEqual([])
    expect(needs.unsized).toBe(0)
    expect(formatUnlicensedNeeds(needs)).toBe('1 × S1, 2 × S5')
  })

  it('flags licensed servers below their hardware and counts servers not yet sized', () => {
    const needs = summarizeFleetTierNeeds(
      [
        fleetServer('a', placement('S1', 'S3'), 'db-1'),
        fleetServer('b', placement('S3', 'S3', 'S5')),
        fleetServer('c', placement('S5', 'S1')),
        fleetServer('d', null),
      ],
      rankOf
    )
    expect(needs.short).toEqual([
      { serverId: 'a', name: 'db-1', licenseTier: 'S1', needsTier: 'S3' },
      { serverId: 'b', name: 'b.example', licenseTier: 'S3', needsTier: 'S5' },
    ])
    expect(needs.unlicensed).toEqual([])
    expect(needs.unsized).toBe(1)
    expect(formatUnlicensedNeeds(needs)).toBe('')
  })
})
