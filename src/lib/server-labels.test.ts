import { describe, expect, it } from 'vitest'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/display-name'
import {
  MAX_SERVER_LABELS,
  MAX_SERVER_LABEL_VALUE_LENGTH,
  parseServerLabelRows,
  pairsToLabelRecord,
  serverLabelsEqual,
} from './server-labels'

function row(id: string, key: string, value: string) {
  return { id, key, value }
}

describe('parseServerLabelRows', () => {
  it('skips blank rows and trims keys', () => {
    const parsed = parseServerLabelRows([
      row('1', ' env ', 'prod'),
      row('2', '', ''),
      row('3', 'region', 'us-east'),
    ])
    expect(parsed).toEqual({
      ok: true,
      labels: { env: 'prod', region: 'us-east' },
    })
  })

  it('rejects keys that do not match the Docker engine-label charset', () => {
    const parsed = parseServerLabelRows([row('1', '-nope', 'x')])
    expect(parsed.ok).toBe(false)
  })

  it('rejects empty keys when a value is set', () => {
    const parsed = parseServerLabelRows([row('1', '', 'x')])
    expect(parsed).toEqual({
      ok: false,
      error: 'Label keys cannot be empty when a value is set.',
    })
  })

  it('rejects duplicate keys after trim', () => {
    const parsed = parseServerLabelRows([
      row('1', 'env', 'a'),
      row('2', ' env', 'b'),
    ])
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new TypeError('expected duplicate-key failure')
    expect(parsed.error).toContain('Duplicate')
  })

  it('accepts Unicode label values within the length cap', () => {
    const parsed = parseServerLabelRows([row('1', 'env', '東京')])
    expect(parsed).toEqual({ ok: true, labels: { env: '東京' } })
  })

  it('rejects values over the shared description length cap', () => {
    const parsed = parseServerLabelRows([
      row('1', 'env', 'v'.repeat(MAX_SERVER_LABEL_VALUE_LENGTH + 1)),
    ])
    expect(parsed.ok).toBe(false)
  })

  it('accepts DESCRIPTION_MAX_LENGTH emoji code points', () => {
    const value = '😀'.repeat(DESCRIPTION_MAX_LENGTH)
    const parsed = parseServerLabelRows([row('1', 'env', value)])
    expect(parsed).toEqual({ ok: true, labels: { env: value } })
  })

  it('rejects DESCRIPTION_MAX_LENGTH + 1 emoji code points', () => {
    const parsed = parseServerLabelRows([
      row('1', 'env', '😀'.repeat(DESCRIPTION_MAX_LENGTH + 1)),
    ])
    expect(parsed.ok).toBe(false)
  })

  it('rejects more than 64 labels', () => {
    const rows = Array.from({ length: MAX_SERVER_LABELS + 1 }, (_, index) =>
      row(String(index), `k${String(index)}`, 'v'),
    )
    const parsed = parseServerLabelRows(rows)
    expect(parsed.ok).toBe(false)
  })
})

describe('serverLabelsEqual', () => {
  it('compares maps by key regardless of insertion order', () => {
    expect(serverLabelsEqual({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(serverLabelsEqual({ a: '1' }, { a: '2' })).toBe(false)
  })
})

describe('pairsToLabelRecord', () => {
  it('returns an empty map when pairs are missing', () => {
    expect(pairsToLabelRecord(undefined)).toEqual({})
  })
})
