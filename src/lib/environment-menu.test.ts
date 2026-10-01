import { describe, expect, it } from 'vitest'
import {
  DESTROY_EXPLANATION,
  LAST_ENVIRONMENT_REASON,
  environmentMenuItems,
} from './environment-menu'

describe('environmentMenuItems', () => {
  it('shows nothing to non-owners', () => {
    expect(environmentMenuItems({ canOwn: false, environmentCount: 3 })).toEqual([])
  })

  it('offers settings and delete to owners with several environments', () => {
    const items = environmentMenuItems({ canOwn: true, environmentCount: 2 })
    expect(items.map((item) => item.id)).toEqual(['settings', 'delete'])
    expect(items.every((item) => item.disabledReason === null)).toBe(true)
  })

  it('explains why delete is unavailable for the last environment', () => {
    const items = environmentMenuItems({ canOwn: true, environmentCount: 1 })
    const del = items.find((item) => item.id === 'delete')
    expect(del?.disabledReason).toBe(LAST_ENVIRONMENT_REASON)
    expect(items.find((item) => item.id === 'settings')?.disabledReason).toBeNull()
  })
})

describe('destroy copy', () => {
  it('says what destroy keeps and what removes it', () => {
    expect(DESTROY_EXPLANATION).toContain('The environment and its settings stay')
    expect(DESTROY_EXPLANATION).toContain('Delete environment')
  })
})
