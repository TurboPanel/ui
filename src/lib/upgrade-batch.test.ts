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
    expect(fleetServersQuery(-50, 'done').offset).toBe(0)
    expect(fleetServersQuery(100, 'done', 25)).toEqual({ offset: 100, limit: 25, status: 'done' })
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
    expect(validateUpgradeBatchInput({ mode: 'count', value: '' })).toEqual({
      ok: false,
      message: 'Enter how many servers update at once.',
    })
    expect(validateUpgradeBatchInput({ mode: 'count', value: '10001' })).toEqual({
      ok: false,
      message: 'Use 1–10000 servers.',
    })
  })

  it('clamps negative fleet offsets and formats labels', () => {
    expect(fleetServersQuery(-3, 'pending').offset).toBe(0)
    expect(formatUpgradeBatchLabel('percent', 100)).toBe('Servers updated at once: all')
    expect(formatUpgradeBatchLabel('percent', 25)).toBe('Servers updated at once: 25%')
    expect(formatUpgradeBatchLabel('count', 1)).toBe('Servers updated at once: 1')
    expect(formatUpgradeBatchLabel('count', 4)).toBe('Servers updated at once: 4')
    for (const label of [
      formatUpgradeBatchLabel('percent', 100),
      formatUpgradeBatchLabel('count', 4),
    ]) {
      expect(label).not.toMatch(/fleet|batch|group/)
    }
  })
})
