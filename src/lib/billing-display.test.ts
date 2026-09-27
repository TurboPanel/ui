import { describe, expect, it } from 'vitest'
import {
  BillingRefusalError,
  type BillingPendingChange,
  type BillingTier,
  type BillingTierSummary,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  addServerTierState,
  canReleaseAt,
  describeBillingRefusal,
  describePendingChange,
  describeUncoveredServer,
  endingLabel,
  formatMachineExamples,
  formatMemoryLimit,
  formatMinorUnits,
  formatTierFits,
  formatTierPrice,
  formatTierSlots,
  isDelinquentSubscription,
  landsAtLabel,
  licenseSummaryLine,
  lowestTierFor,
  MACHINE_EXAMPLES,
  machineExamplesForTier,
  parseLicenseCount,
  refusalTierId,
  removableAt,
  serverTitle,
  subscriptionStatusView,
  tierChangeDirection,
  tierLabelOf,
  tierLicensesLine,
  uncoveredServers,
} from './billing-display'

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

const GIB = 1024 ** 3

describe('formatTierPrice / formatTierFits / formatTierSlots', () => {
  it('prices numbered tiers per license and names the negotiated one', () => {
    expect(formatTierPrice({ priceCents: 4900, currency: 'usd', isCustom: false })).toBe(
      '$49.00 / license / month'
    )
    expect(formatTierPrice({ priceCents: 4900 })).toBe('$49.00 / license / month')
    expect(formatTierPrice({ priceCents: null, isCustom: false })).toBe('Price not available')
    expect(formatTierPrice({ priceCents: 1, isCustom: true })).toBe('Negotiated')
  })

  it('formats memory ceilings in GiB', () => {
    expect(formatMemoryLimit(16 * GIB)).toBe('16 GiB')
    expect(formatMemoryLimit(1.5 * GIB)).toBe('1.5 GiB')
    expect(formatMemoryLimit(0)).toBe('—')
  })

  it('reads the ladder entitlements and dashes a tier the ladder dropped', () => {
    const entitlements = {
      maxCores: 16,
      maxMemoryBytes: 64 * GIB,
      nicSlots: 5,
      driveSlots: 6,
      gpuSlots: 2,
      filesystemSlots: 9,
    }
    expect(formatTierFits(entitlements)).toBe('16 cores · 64 GiB')
    expect(formatTierSlots(entitlements)).toBe('5 NIC · 6 drive · 2 GPU · 9 extra FS')
    expect(formatTierFits(null)).toBe('—')
    expect(formatTierSlots(undefined)).toBe('—')
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
    kind: 'downgrade',
    fromTierId: 't2',
    toTierId: 't1',
    createdAt: '2026-09-01T00:00:00Z',
    landsAt: null,
    ...overrides,
  }
}

describe('describePendingChange', () => {
  it('resolves tier labels and says when the change lands', () => {
    expect(describePendingChange(change({}), tiers)).toBe(
      'One license moves from S2 to S1 at the end of the current period.'
    )
    const dated = describePendingChange(
      change({ kind: 'release-seat', fromTierId: 't1', toTierId: null, landsAt: '2026-10-01T00:00:00Z' }),
      tiers
    )
    expect(dated).toMatch(/^One S1 license ends on .+\.$/)
    expect(dated).not.toContain('end of the current period')
  })

  it('falls back to raw ids for tiers missing from the catalogue', () => {
    expect(describePendingChange(change({ toTierId: 'gone' }), tiers)).toContain('to gone')
    expect(tierLabelOf(tiers, null)).toBe('—')
    expect(tierLabelOf(tiers, 't2')).toBe('S2')
  })

  it('labels a missing landing date as the end of the current period', () => {
    expect(landsAtLabel(null)).toBe('at the end of the current period')
    expect(landsAtLabel('2026-10-01T00:00:00Z')).toMatch(/^on /)
  })
})

const OCT_26 = '2026-10-26T00:00:00.000Z'
const oct26 = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
  new Date(OCT_26)
)

function tierRow(overrides: Partial<BillingTierSummary> = {}): BillingTierSummary {
  return {
    tierId: 't1',
    label: 'S1',
    rank: 1,
    purchased: 6,
    inUse: 3,
    ending: 0,
    endsAt: null,
    available: 3,
    priceCents: 500,
    currency: 'usd',
    ...overrides,
  }
}

describe('license summary lines', () => {
  it('summarises the organization in one line', () => {
    expect(
      licenseSummaryLine({
        purchased: 4,
        ending: 0,
        endsAt: null,
        inUse: 1,
        bound: 1,
        available: 3,
      })
    ).toBe('1 of 4 licenses in use · 3 more servers can be added')
    expect(
      licenseSummaryLine({ purchased: 1, ending: 0, endsAt: null, inUse: 1, bound: 1, available: 0 })
    ).toBe('1 of 1 license in use · no room for another server')
  })

  it('never counts an ending license as in use — it names the date and says restore', () => {
    expect(
      licenseSummaryLine({ purchased: 6, ending: 3, endsAt: OCT_26, inUse: 3, bound: 3, available: 0 })
    ).toBe(`3 of 6 licenses in use · 3 end ${oct26} · restore one to add another server`)
  })

  it('reads the deprecated held count from an older control plane', () => {
    expect(
      licenseSummaryLine({
        purchased: 2,
        ending: 0,
        endsAt: null,
        held: 2,
        bound: 2,
        available: 0,
      } as unknown as Parameters<typeof licenseSummaryLine>[0])
    ).toBe('2 of 2 licenses in use · no room for another server')
  })

  it('summarises one tier, naming ending licenses with their date', () => {
    expect(tierLicensesLine(tierRow())).toBe('Licenses at S1: 6 purchased, 3 in use')
    expect(tierLicensesLine(tierRow({ ending: 1, endsAt: OCT_26 }))).toBe(
      `Licenses at S1: 6 purchased, 3 in use, 1 ends ${oct26}`
    )
  })
})

describe('endingLabel', () => {
  it('is empty when nothing is ending', () => {
    expect(endingLabel(0, OCT_26)).toBe('')
  })
  it('pluralises and dates', () => {
    expect(endingLabel(1, OCT_26)).toBe(`1 ends ${oct26}`)
    expect(endingLabel(3, OCT_26)).toBe(`3 end ${oct26}`)
    expect(endingLabel(2, null)).toBe('2 end at the end of the period')
  })
})

describe('removableAt / canReleaseAt', () => {
  it('offers only licenses that are neither ending nor covering a server', () => {
    expect(removableAt(tierRow({ purchased: 6, ending: 3, inUse: 3 }))).toBe(0)
    expect(removableAt(tierRow({ purchased: 6, ending: 1, inUse: 3 }))).toBe(2)
    expect(removableAt(tierRow({ purchased: 2, ending: 0, inUse: 5 }))).toBe(0)
  })
  it('counts a pending downgrade the older control plane reports as releasing', () => {
    expect(removableAt(tierRow({ purchased: 6, ending: 1, releasing: 2, inUse: 3 }))).toBe(1)
    expect(canReleaseAt(tierRow({ purchased: 2, ending: 1, releasing: 2 }))).toBe(false)
    expect(canReleaseAt(tierRow({ purchased: 2, ending: 1 }))).toBe(true)
  })
})

describe('parseLicenseCount', () => {
  it('accepts whole numbers of at least 1', () => {
    expect(parseLicenseCount('1')).toBe(1)
    expect(parseLicenseCount(' 12 ')).toBe(12)
  })
  it('refuses zero, negatives, decimals and junk', () => {
    for (const raw of ['0', '-1', '1.5', '1e3', '', 'abc', '0x10']) {
      expect(parseLicenseCount(raw)).toBeNull()
    }
  })
})

describe('addServerTierState — restore before buy, per tier', () => {
  it('uses a free license when the tier has one', () => {
    const state = addServerTierState('S1', tierRow({ available: 2, ending: 3, endsAt: OCT_26 }))
    expect(state.kind).toBe('available')
    expect(state.message).toBe('2 S1 licenses are free for this server.')
  })
  it('asks to restore an ending license before buying when none is free', () => {
    const state = addServerTierState('S1', tierRow({ available: 0, ending: 3, endsAt: OCT_26 }))
    expect(state).toEqual({
      kind: 'restore',
      ending: 3,
      endsAt: OCT_26,
      message: `No S1 license is free. 3 end ${oct26} — restore one to use it for this server.`,
    })
  })
  it('offers to buy only when nothing at that tier is ending', () => {
    expect(addServerTierState('S2', tierRow({ label: 'S2', available: 0, ending: 0 }))).toEqual({
      kind: 'buy',
      message: 'No S2 license is free. Buy one to add this server.',
    })
    expect(addServerTierState('S3', null).kind).toBe('buy')
  })
})

describe('refusalTierId', () => {
  const refusal = {
    tiers: [
      { tierId: 't1', label: 'S1', purchased: 3, inUse: 3, ending: 0, endsAt: null, available: 0 },
      { tierId: 't2', label: 'S2', purchased: 2, inUse: 0, ending: 2, endsAt: OCT_26, available: 0 },
    ],
  }
  it('prefers the tier the operator chose', () => {
    expect(refusalTierId('t1', refusal)).toBe('t1')
  })
  it('falls back to the first tier with licenses ending', () => {
    expect(refusalTierId(null, refusal)).toBe('t2')
    expect(refusalTierId(null, { tiers: [] })).toBeNull()
    expect(refusalTierId(null, null)).toBeNull()
  })
})

function server(id: string, name: string | null, hostname: string | null = null): OrgServerRecord {
  return { id, name, hostname } as unknown as OrgServerRecord
}

describe('uncoveredServers', () => {
  const servers = [server('b', 'db-1'), server('a', null, 'edge.example'), server('c', 'web-1')]

  it('names the servers nothing bought covers, sorted by name', () => {
    const out = uncoveredServers(
      [
        { serverId: 'c', assignedTierId: null, requiredTier: 'S5' },
        { serverId: 'b', assignedTierId: 't3', requiredTier: 'S3' },
        { serverId: 'a', assignedTierId: null, requiredTier: null },
        { serverId: 'zzz', assignedTierId: null, requiredTier: 'S1' },
      ],
      servers
    )
    expect(out).toEqual([
      { serverId: 'a', name: 'edge.example', requiredTier: null },
      { serverId: 'c', name: 'web-1', requiredTier: 'S5' },
      { serverId: 'zzz', name: 'zzz', requiredTier: 'S1' },
    ])
    expect(uncoveredServers(null, servers)).toEqual([])
  })

  it('says what each one needs', () => {
    expect(describeUncoveredServer({ serverId: 'c', name: 'web-1', requiredTier: 'S5' })).toBe(
      'web-1 needs S5'
    )
    expect(describeUncoveredServer({ serverId: 'a', name: 'edge', requiredTier: null })).toBe(
      'edge has not reported hardware yet'
    )
    expect(serverTitle(server('x', '  '))).toBe('x')
  })
})

describe('describeBillingRefusal', () => {
  const refusal = (body: Record<string, unknown>, status = 409) =>
    new BillingRefusalError('/billing/seats', status, body)

  it('names the server a reduction would strand and the tier it needs', () => {
    const names = { serverName: (id: string) => (id === 'srv-1' ? 'web-1' : null) }
    expect(
      describeBillingRefusal(refusal({ error: 'servers_uncovered', serverId: 'srv-1', requiredTier: 'S5' }), names)
    ).toBe('web-1 needs S5 and would be left uncovered. Move a license up to S5 or buy one there first.')
    expect(
      describeBillingRefusal(refusal({ error: 'servers_uncovered', serverId: 'srv-2', requiredTier: 'S2' }), names)
    ).toContain('srv-2 needs S2')
    expect(describeBillingRefusal(refusal({ error: 'servers_uncovered' }))).toBe(
      'A server would be left uncovered. Buy or move a license that covers it first.'
    )
  })

  it('asks to restore ending licenses before buying at that tier', () => {
    const labels = { tierLabel: (id: string) => (id === 't1' ? 'S1' : null) }
    expect(
      describeBillingRefusal(
        refusal({ error: 'licenses_ending', tierId: 't1', ending: 3, endsAt: OCT_26 }),
        labels
      )
    ).toBe(`You have 3 S1 licenses ending ${oct26} — restore those first.`)
    expect(
      describeBillingRefusal(refusal({ error: 'licenses_ending', tierId: 'tx', ending: 1, endsAt: null }))
    ).toBe('You have 1 license ending at the end of the period — restore those first.')
    expect(describeBillingRefusal(refusal({ error: 'no_licenses_ending' }))).toContain('Refresh')
  })

  it('explains the other refusals with a next step', () => {
    expect(
      describeBillingRefusal(refusal({ error: 'licenses_in_use', purchasedAfter: 2, licensesHeld: 3 }))
    ).toBe('3 licenses are in use but only 2 would remain. Remove a server or a waiting key first.')
    expect(describeBillingRefusal(refusal({ error: 'licenses_in_use' }))).toContain('Remove a server')
    expect(describeBillingRefusal(refusal({ error: 'subscription_past_due' }))).toContain('past due')
    expect(describeBillingRefusal(refusal({ error: 'no_subscription' }))).toContain('no subscription')
    expect(describeBillingRefusal(refusal({ error: 'subscription_exists' }))).toContain('already has')
    expect(describeBillingRefusal(refusal({ error: 'billing_mutation_in_progress' }))).toContain(
      'Try again'
    )
    expect(describeBillingRefusal(refusal({ error: 'not_an_upgrade' }, 400))).toContain('down the ladder')
    expect(describeBillingRefusal(refusal({ error: 'not_a_downgrade' }, 400))).toContain('up the ladder')
    expect(describeBillingRefusal(refusal({ error: 'tier_not_purchasable' }, 400))).toContain(
      'cannot be bought'
    )
  })

  it('answers null for anything it does not recognise', () => {
    expect(describeBillingRefusal(refusal({ error: 'stripe_error' }, 502))).toBeNull()
    expect(describeBillingRefusal(new Error('HTTP 500'))).toBeNull()
    expect(describeBillingRefusal(null)).toBeNull()
  })
})

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
    rank,
    priceCents: isCustom ? null : rank * 1000,
    currency: isCustom ? null : 'usd',
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
  ladderTier('SX', 8, 1024, 4096, 16, true),
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

  it('skips a tier the ladder no longer describes', () => {
    const dropped = [{ ...LADDER[0]!, entitlements: null }, ...LADDER.slice(1)]
    expect(lowestTierFor({ cores: 2, memoryBytes: 4 * GIB, gpus: 0 }, dropped)?.label).toBe('S3')
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
