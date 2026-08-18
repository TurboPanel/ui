import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatElapsedSince,
  formatLocalDateTime,
  formatRelativeLocalDateTime,
  type FormatLocalDateTimeOptions,
} from '@/lib/format-datetime'

const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z')
const FIXED_ISO = '2024-01-15T12:30:45.000Z'

function expectedLocalDateTime(
  options: {
    includeDate?: boolean
    includeSeconds?: boolean
    timeZone?: string
    timeZoneName?: 'short' | 'long' | null
  } = {},
): string {
  const {
    includeDate = true,
    includeSeconds = true,
    timeZone,
    timeZoneName = 'short',
  } = options

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
  }

  if (timeZoneName) {
    formatOptions.timeZoneName = timeZoneName
  }

  if (includeDate) {
    formatOptions.year = 'numeric'
    formatOptions.month = 'short'
    formatOptions.day = 'numeric'
  }

  if (timeZone) {
    formatOptions.timeZone = timeZone
  }

  return new Intl.DateTimeFormat(undefined, formatOptions).format(
    new Date(FIXED_ISO),
  )
}

describe('formatLocalDateTime', () => {
  it('returns fallback for null, undefined, empty, and invalid inputs', () => {
    expect(formatLocalDateTime(null)).toBe('—')
    expect(formatLocalDateTime(undefined)).toBe('—')
    expect(formatLocalDateTime('')).toBe('—')
    expect(formatLocalDateTime('not-a-date')).toBe('—')
    expect(formatLocalDateTime(new Date('invalid'))).toBe('—')
    expect(formatLocalDateTime(null, { fallback: 'missing' })).toBe('missing')
  })

  it('formats Date, string, and numeric timestamps with UTC zone', () => {
    const opts = { timeZone: 'UTC' }
    const expected = expectedLocalDateTime(opts)

    expect(formatLocalDateTime(new Date(FIXED_ISO), opts)).toBe(expected)
    expect(formatLocalDateTime(FIXED_ISO, opts)).toBe(expected)
    expect(formatLocalDateTime(Date.parse(FIXED_ISO), opts)).toBe(expected)
  })

  it('omits date when includeDate is false', () => {
    const opts: FormatLocalDateTimeOptions = {
      includeDate: false,
      timeZone: 'UTC',
      timeZoneName: null,
    }
    expect(formatLocalDateTime(FIXED_ISO, opts)).toBe(
      expectedLocalDateTime(opts),
    )
  })

  it('omits seconds when includeSeconds is false', () => {
    const opts: FormatLocalDateTimeOptions = {
      includeSeconds: false,
      timeZone: 'UTC',
      timeZoneName: null,
    }
    expect(formatLocalDateTime(FIXED_ISO, opts)).toBe(
      expectedLocalDateTime(opts),
    )
  })

  it('supports long timezone names', () => {
    const opts = { timeZone: 'UTC', timeZoneName: 'long' as const }
    expect(formatLocalDateTime(FIXED_ISO, opts)).toBe(
      expectedLocalDateTime(opts),
    )
  })
})

describe('formatRelativeLocalDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns neverLabel for missing or invalid timestamps', () => {
    expect(formatRelativeLocalDateTime(null)).toBe('Never')
    expect(formatRelativeLocalDateTime(undefined)).toBe('Never')
    expect(formatRelativeLocalDateTime('bad')).toBe('Never')
    expect(
      formatRelativeLocalDateTime(null, { neverLabel: 'N/A' }),
    ).toBe('N/A')
  })

  it('formats seconds, minutes, hours, and days ago with absolute suffix', () => {
    const absolute: FormatLocalDateTimeOptions = {
      timeZone: 'UTC',
      timeZoneName: null,
      includeSeconds: false,
    }

    expect(
      formatRelativeLocalDateTime('2024-06-15T11:59:30.000Z', { absolute }),
    ).toMatch(/^30s ago \(/)

    expect(
      formatRelativeLocalDateTime('2024-06-15T11:55:00.000Z', { absolute }),
    ).toMatch(/^5m ago \(/)

    expect(
      formatRelativeLocalDateTime('2024-06-15T09:00:00.000Z', { absolute }),
    ).toMatch(/^3h ago \(/)

    expect(
      formatRelativeLocalDateTime('2024-06-13T12:00:00.000Z', { absolute }),
    ).toMatch(/^2d ago \(/)
  })

  it('returns absolute label only for future timestamps', () => {
    const absolute: FormatLocalDateTimeOptions = {
      timeZone: 'UTC',
      timeZoneName: null,
      includeSeconds: false,
    }
    const expected = formatLocalDateTime('2024-06-15T13:00:00.000Z', absolute)

    expect(
      formatRelativeLocalDateTime('2024-06-15T13:00:00.000Z', { absolute }),
    ).toBe(expected)
  })
})

describe('formatElapsedSince', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns fallback for missing or invalid timestamps', () => {
    expect(formatElapsedSince(null)).toBe('Unknown')
    expect(formatElapsedSince('invalid')).toBe('Unknown')
    expect(formatElapsedSince(null, { fallback: '?' })).toBe('?')
  })

  it('returns justNowLabel for future timestamps', () => {
    expect(formatElapsedSince('2024-06-15T13:00:00.000Z')).toBe('Just now')
    expect(
      formatElapsedSince('2024-06-15T13:00:00.000Z', {
        justNowLabel: 'Future',
      }),
    ).toBe('Future')
  })

  it('formats elapsed seconds, minutes, hours, and days', () => {
    expect(formatElapsedSince('2024-06-15T11:59:15.000Z')).toBe('45s')
    expect(formatElapsedSince('2024-06-15T11:58:30.000Z')).toBe('1m 30s')
    expect(formatElapsedSince('2024-06-15T11:00:00.000Z')).toBe('1h 0m')
    expect(formatElapsedSince('2024-06-14T12:00:00.000Z')).toBe('1d 0h')
  })
})
