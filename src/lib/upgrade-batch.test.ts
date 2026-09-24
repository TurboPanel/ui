import { describe, expect, it } from 'vitest'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE, validateUpgradeBatchInput } from '@/lib/upgrade-batch'

describe('validateUpgradeBatchInput', () => {
  it('accepts default percent', () => {
    expect(validateUpgradeBatchInput({ mode: 'percent', value: '100' })).toEqual({
      ok: true,
      mode: 'percent',
      value: 100,
    })
  })

  it('rejects zero percent', () => {
    const result = validateUpgradeBatchInput({ mode: 'percent', value: '0' })
    expect(result.ok).toBe(false)
  })

  it('asks the server for the page after the first fifty', () => {
    const first = fleetServersQuery(0, '')
    const second = fleetServersQuery(UPGRADE_FLEET_PAGE_SIZE, 'needs_attention')
    expect(first).toEqual({ offset: 0, limit: 50, status: '' })
    expect(second.offset).toBe(50)
    expect(second.limit).toBe(50)
    expect(fleetServersQuery(0, 'done').offset).toBe(0)
  })

  it('accepts count batches', () => {
    expect(validateUpgradeBatchInput({ mode: 'count', value: '5' })).toEqual({
      ok: true,
      mode: 'count',
      value: 5,
    })
  })
})
