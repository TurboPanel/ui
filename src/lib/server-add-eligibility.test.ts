import { describe, expect, it } from 'vitest'
import { resolveServerAddEligibility } from './server-add-eligibility.ts'

describe('resolveServerAddEligibility', () => {
  it('allows add when capacity is omitted or unlimited', () => {
    expect(resolveServerAddEligibility().canAdd).toBe(true)
    expect(
      resolveServerAddEligibility({
        maxServers: null,
        serverCount: 3,
        reservedSeatCount: 1,
        usedSeats: 4,
        availableSeats: null,
      }).canAdd,
    ).toBe(true)
  })

  it('blocks add when no seats remain', () => {
    const blocked = resolveServerAddEligibility({
      maxServers: 2,
      serverCount: 1,
      reservedSeatCount: 1,
      usedSeats: 2,
      availableSeats: 0,
    })
    expect(blocked.canAdd).toBe(false)
    expect(blocked.reason).toContain('2 of 2')
  })

  it('allows add when seats remain', () => {
    expect(
      resolveServerAddEligibility({
        maxServers: 5,
        serverCount: 2,
        reservedSeatCount: 0,
        usedSeats: 2,
        availableSeats: 3,
      }).canAdd,
    ).toBe(true)
  })
})
