import { describe, expect, it } from 'vitest'
import { managedErrorMessage } from '@/lib/managed-services'
import {
  newLoginStraightThrough,
  newLoginStraightThroughPayload,
  straightThroughDefaultFor,
  supportsStraightThrough,
} from '@/lib/managed-straight-through'

describe('supportsStraightThrough', () => {
  it('is PostgreSQL only', () => {
    expect(supportsStraightThrough('postgres')).toBe(true)
    for (const engine of ['mysql', 'mariadb', 'redis', 'clickhouse', null, undefined]) {
      expect(supportsStraightThrough(engine)).toBe(false)
    }
  })
})

describe('new login defaults', () => {
  it('is on for Migration and off for the other levels', () => {
    expect(straightThroughDefaultFor(['owner'])).toBe(true)
    expect(straightThroughDefaultFor(['read-write'])).toBe(false)
    expect(straightThroughDefaultFor(['read-only'])).toBe(false)
    expect(straightThroughDefaultFor(['admin'])).toBe(false)
  })

  it('shows the default until the owner chooses, and the choice after', () => {
    expect(newLoginStraightThrough(null, ['owner'], false)).toBe(true)
    expect(newLoginStraightThrough(null, ['read-write'], false)).toBe(false)
    expect(newLoginStraightThrough(false, ['owner'], false)).toBe(false)
    expect(newLoginStraightThrough(true, ['read-write'], false)).toBe(true)
  })

  it('turns off when a source limit is added', () => {
    expect(newLoginStraightThrough(null, ['owner'], true)).toBe(false)
    expect(newLoginStraightThrough(true, ['owner'], true)).toBe(false)
  })
})

describe('newLoginStraightThroughPayload', () => {
  it('sends only an explicit choice', () => {
    expect(newLoginStraightThroughPayload('postgres', null, false)).toEqual({})
    expect(newLoginStraightThroughPayload('postgres', true, false)).toEqual({
      straightThrough: true,
    })
    expect(newLoginStraightThroughPayload('postgres', false, false)).toEqual({
      straightThrough: false,
    })
  })

  it('sends nothing with a source limit, which the control plane would refuse', () => {
    expect(newLoginStraightThroughPayload('postgres', true, true)).toEqual({})
  })

  it('sends nothing for other engines', () => {
    expect(newLoginStraightThroughPayload('mysql', true, false)).toEqual({})
    expect(newLoginStraightThroughPayload(null, true, false)).toEqual({})
  })
})

describe('straight through error messages', () => {
  it('maps the three refusals to plain words', () => {
    expect(
      managedErrorMessage(new Error('HTTP 400: straight_through_conflicts_with_source_limit'), 'x')
    ).toBe(
      'A login that connects straight through cannot be limited to certain addresses. Turn one off.'
    )
    expect(managedErrorMessage(new Error('HTTP 400: straight_through_postgres_only'), 'x')).toBe(
      'Connecting straight through is only available for PostgreSQL.'
    )
    expect(
      managedErrorMessage(new Error('HTTP 400: straight_through_login_not_allowed'), 'x')
    ).toBe('The cluster administrator and replication logins cannot connect straight through.')
  })
})
