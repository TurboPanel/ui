import { describe, expect, it } from 'vitest'
import { formatLogLineTime } from './log-line-time'

describe('formatLogLineTime', () => {
  it('shows local hours, minutes, seconds and milliseconds', () => {
    const at = new Date(2026, 9, 26, 9, 4, 7, 5)
    expect(formatLogLineTime(at.toISOString())).toBe('09:04:07.005')
  })

  it('keeps every time the same width so the column lines up', () => {
    const times = [0, 9, 99, 999].map((ms) =>
      formatLogLineTime(new Date(2026, 9, 26, 13, 42, 37, ms).toISOString())
    )
    expect(times).toEqual(['13:42:37.000', '13:42:37.009', '13:42:37.099', '13:42:37.999'])
    expect(new Set(times.map((time) => time?.length))).toEqual(new Set([12]))
  })

  it('shows nothing for a line without a usable time', () => {
    expect(formatLogLineTime(null)).toBeNull()
    expect(formatLogLineTime('')).toBeNull()
    expect(formatLogLineTime('not a time')).toBeNull()
  })
})
