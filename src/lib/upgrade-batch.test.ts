import { describe, expect, it } from 'vitest'
import {
  fleetServersQuery,
  formatUpgradeBatchLabel,
  UPGRADE_FLEET_PAGE_SIZE,
  validateUpgradeBatchInput,
} from '@/lib/upgrade-batch'

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

  it('rejects empty, fractional, and out-of-range values', () => {
    expect(validateUpgradeBatchInput({ mode: 'percent', value: '  ' }).ok).toBe(false)
    expect(validateUpgradeBatchInput({ mode: 'percent', value: '12.5' }).ok).toBe(false)
    expect(validateUpgradeBatchInput({ mode: 'percent', value: '101' }).ok).toBe(false)
    expect(validateUpgradeBatchInput({ mode: 'count', value: '0' }).ok).toBe(false)
    expect(validateUpgradeBatchInput({ mode: 'count', value: '10001' }).ok).toBe(false)
  })

  it('clamps negative fleet offsets and formats labels', () => {
    expect(fleetServersQuery(-3, 'pending').offset).toBe(0)
    expect(formatUpgradeBatchLabel('percent', 25)).toBe('25% of fleet per batch')
    expect(formatUpgradeBatchLabel('count', 1)).toBe('1 server per batch')
    expect(formatUpgradeBatchLabel('count', 4)).toBe('4 servers per batch')
  })
})
