import { describe, expect, it } from 'vitest'
import {
  formatAxisTime,
  formatBytes,
  formatBytesPerSecond,
  formatCoveragePercent,
  formatCount,
  formatOpsPerSecond,
  formatPercent,
  formatUptimeSeconds,
  presentSamplesFromGaps,
  type MetricsRangeId,
} from '@/lib/format-metrics'
import { formatLocalDateTime } from '@/lib/format-datetime'

describe('formatPercent', () => {
  it('returns em dash for null, undefined, and non-finite values', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('formats finite percentages with one decimal', () => {
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(42.567)).toBe('42.6%')
    expect(formatPercent(-3.2)).toBe('-3.2%')
  })
})

describe('formatBytes', () => {
  it('returns em dash for null, undefined, and non-finite values', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })

  it('scales bytes through KiB, MiB, and caps at TiB', () => {
    expect(formatBytes(0)).toBe('0.00 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.00 KiB')
    expect(formatBytes(1024 ** 2)).toBe('1.00 MiB')
    expect(formatBytes(1024 ** 3)).toBe('1.00 GiB')
    expect(formatBytes(-2048)).toBe('-2.00 KiB')
    expect(formatBytes(1536)).toBe('1.50 KiB')
    expect(formatBytes(10_240)).toBe('10.0 KiB')
    expect(formatBytes(102_400)).toBe('100 KiB')
    expect(formatBytes(1024 ** 4)).toBe('1.00 TiB')
    expect(formatBytes(1024 ** 5)).toBe('1024 TiB')
  })
})

describe('formatBytesPerSecond', () => {
  it('returns em dash for invalid values', () => {
    expect(formatBytesPerSecond(null)).toBe('—')
    expect(formatBytesPerSecond(undefined)).toBe('—')
  })

  it('appends per-second suffix to scaled byte values', () => {
    expect(formatBytesPerSecond(2048)).toBe('2.00 KiB/s')
    expect(formatBytesPerSecond(1_048_576)).toBe('1.00 MiB/s')
  })
})

describe('formatOpsPerSecond', () => {
  it('returns em dash for invalid values', () => {
    expect(formatOpsPerSecond(null)).toBe('—')
    expect(formatOpsPerSecond(undefined)).toBe('—')
  })

  it('formats sub-10, whole, and kilo ops rates', () => {
    expect(formatOpsPerSecond(5.5)).toBe('5.5 ops/s')
    expect(formatOpsPerSecond(10.5)).toBe('11 ops/s')
    expect(formatOpsPerSecond(999)).toBe('999 ops/s')
    expect(formatOpsPerSecond(1500)).toBe('1.5k ops/s')
    expect(formatOpsPerSecond(12_500)).toBe('12.5k ops/s')
  })
})

describe('formatCount', () => {
  it('returns em dash for invalid values', () => {
    expect(formatCount(null)).toBe('—')
    expect(formatCount(undefined)).toBe('—')
  })

  it('rounds small counts and abbreviates thousands and millions', () => {
    expect(formatCount(42)).toBe('42')
    expect(formatCount(42.7)).toBe('43')
    expect(formatCount(9999)).toBe('9999')
    expect(formatCount(10_000)).toBe('10.0k')
    expect(formatCount(12_500)).toBe('12.5k')
    expect(formatCount(1_500_000)).toBe('1.5M')
  })
})

describe('formatUptimeSeconds', () => {
  it('returns em dash for invalid values', () => {
    expect(formatUptimeSeconds(null)).toBe('—')
    expect(formatUptimeSeconds(undefined)).toBe('—')
  })

  it('formats minutes-only, hours+minutes, and days+hours', () => {
    expect(formatUptimeSeconds(-60)).toBe('0m')
    expect(formatUptimeSeconds(60)).toBe('1m')
    expect(formatUptimeSeconds(3660)).toBe('1h 1m')
    expect(formatUptimeSeconds(90_061)).toBe('1d 1h')
  })
})

describe('formatAxisTime', () => {
  const axisMs = Date.parse('2024-03-10T15:45:00.000Z')

  const shortRanges: MetricsRangeId[] = ['1h', '6h', '24h']
  const longRanges: MetricsRangeId[] = ['7d', '30d', '90d']

  it('uses time-only labels for short ranges', () => {
    for (const rangeId of shortRanges) {
      expect(formatAxisTime(axisMs, rangeId)).toBe(
        formatLocalDateTime(axisMs, {
          includeDate: false,
          includeSeconds: false,
          timeZoneName: null,
        }),
      )
    }
  })

  it('includes date for long ranges', () => {
    for (const rangeId of longRanges) {
      expect(formatAxisTime(axisMs, rangeId)).toBe(
        formatLocalDateTime(axisMs, {
          includeDate: true,
          includeSeconds: false,
          timeZoneName: null,
        }),
      )
    }
  })
})

describe('formatCoveragePercent', () => {
  it('returns em dash when expected samples are zero or negative', () => {
    expect(formatCoveragePercent(5, 0)).toBe('—')
    expect(formatCoveragePercent(5, -1)).toBe('—')
  })

  it('computes percentage and clamps present samples to expected', () => {
    expect(formatCoveragePercent(30, 60)).toBe('50.0%')
    expect(formatCoveragePercent(0, 10)).toBe('0.0%')
    expect(formatCoveragePercent(100, 60)).toBe('100.0%')
    expect(formatCoveragePercent(-5, 10)).toBe('0.0%')
  })
})

describe('presentSamplesFromGaps', () => {
  it('returns zero when expected samples are not positive', () => {
    expect(presentSamplesFromGaps(0, 0)).toBe(0)
    expect(presentSamplesFromGaps(-3, 5)).toBe(0)
  })

  it('subtracts gaps and clamps at zero', () => {
    expect(presentSamplesFromGaps(60, 10)).toBe(50)
    expect(presentSamplesFromGaps(60, 80)).toBe(0)
    expect(presentSamplesFromGaps(60, -5)).toBe(60)
  })
})
