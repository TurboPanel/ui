import { describe, expect, it } from 'vitest'
import {
  celsiusToDisplay,
  cpuBusyPercent,
  formatAxisTime,
  formatBytes,
  formatBytesPerSecond,
  formatCelsius,
  formatCelsiusAs,
  formatCoveragePercent,
  formatCount,
  formatCpuBusyPercent,
  formatMilliseconds,
  hardwareSignalDisplayTitle,
  formatOpsPerSecond,
  formatPercent,
  formatPhysicalSignalValue,
  formatUptimeSeconds,
  formatWatts,
  physicalSignalUnitLabel,
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

describe('formatCelsius', () => {
  it('returns em dash for null and non-finite values', () => {
    expect(formatCelsius(null)).toBe('—')
    expect(formatCelsius(undefined)).toBe('—')
    expect(formatCelsius(Number.NaN)).toBe('—')
  })

  it('formats one decimal with a degree unit', () => {
    expect(formatCelsius(56.25)).toBe('56.3 °C')
    expect(formatCelsius(0)).toBe('0.0 °C')
  })
})

describe('celsiusToDisplay', () => {
  it('returns null for null, undefined, and non-finite values', () => {
    expect(celsiusToDisplay(null, 'celsius')).toBeNull()
    expect(celsiusToDisplay(undefined, 'fahrenheit')).toBeNull()
    expect(celsiusToDisplay(Number.NaN, 'celsius')).toBeNull()
  })

  it('passes Celsius through unchanged', () => {
    expect(celsiusToDisplay(0, 'celsius')).toBe(0)
    expect(celsiusToDisplay(100, 'celsius')).toBe(100)
  })

  it('converts to Fahrenheit at the boundary values', () => {
    expect(celsiusToDisplay(0, 'fahrenheit')).toBe(32)
    expect(celsiusToDisplay(100, 'fahrenheit')).toBe(212)
  })
})

describe('formatCelsiusAs', () => {
  it('returns em dash for null and non-finite values', () => {
    expect(formatCelsiusAs(null, 'celsius')).toBe('—')
    expect(formatCelsiusAs(Number.NaN, 'fahrenheit')).toBe('—')
  })

  it('formats Celsius with the °C unit', () => {
    expect(formatCelsiusAs(56.25, 'celsius')).toBe('56.3 °C')
  })

  it('formats Fahrenheit with the °F unit', () => {
    expect(formatCelsiusAs(0, 'fahrenheit')).toBe('32.0 °F')
    expect(formatCelsiusAs(100, 'fahrenheit')).toBe('212.0 °F')
  })
})

describe('formatWatts', () => {
  it('returns em dash for null and non-finite values', () => {
    expect(formatWatts(null)).toBe('—')
    expect(formatWatts(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('formats one decimal with a watt unit', () => {
    expect(formatWatts(35.04)).toBe('35.0 W')
  })

  it('formats sub-50 milliwatt readings in milliwatts', () => {
    expect(formatWatts(0.0004)).toBe('0.4 mW')
    expect(formatWatts(0.1)).toBe('0.1 W')
    expect(formatWatts(0)).toBe('0.0 W')
  })
})

describe('hardwareSignalDisplayTitle', () => {
  it('renames kernel RAPL package power and coretemp package temperature', () => {
    expect(
      hardwareSignalDisplayTitle({
        signalId: 'signal:intel-rapl:package-0',
        kind: 'power',
        label: 'package-0',
      })
    ).toBe('CPU package power')
    expect(
      hardwareSignalDisplayTitle({
        signalId: 'signal:coretemp:Package id 0',
        kind: 'temperature',
        label: 'Package id 0',
      })
    ).toBe('CPU package temperature')
  })

  it('passes through already-friendly and unrelated labels', () => {
    expect(
      hardwareSignalDisplayTitle({
        signalId: 'signal:cpu:hottest-core',
        kind: 'temperature',
        label: 'Hottest core',
      })
    ).toBe('Hottest core')
    expect(
      hardwareSignalDisplayTitle({
        signalId: 'signal:nvme:Composite',
        kind: 'temperature',
        label: 'Composite',
      })
    ).toBe('Composite')
  })
})

describe('physicalSignalUnitLabel', () => {
  it('renders celsius as the org-configured temperature unit', () => {
    expect(physicalSignalUnitLabel('celsius', 'celsius')).toBe('°C')
    expect(physicalSignalUnitLabel('celsius', 'fahrenheit')).toBe('°F')
  })

  it('renders known non-temperature units and passes through unknown ones', () => {
    expect(physicalSignalUnitLabel('watts', 'celsius')).toBe('W')
    expect(physicalSignalUnitLabel('rpm', 'celsius')).toBe('RPM')
    expect(physicalSignalUnitLabel('percent', 'celsius')).toBe('%')
    expect(physicalSignalUnitLabel('volts', 'celsius')).toBe('volts')
  })
})

describe('formatPhysicalSignalValue', () => {
  it('returns em dash for null and non-finite values', () => {
    expect(formatPhysicalSignalValue(null, 'celsius', 'celsius')).toBe('—')
    expect(formatPhysicalSignalValue(Number.NaN, 'watts', 'celsius')).toBe('—')
  })

  it('converts celsius readings to the org-configured display unit', () => {
    expect(formatPhysicalSignalValue(85, 'celsius', 'celsius')).toBe('85.0 °C')
    expect(formatPhysicalSignalValue(85, 'celsius', 'fahrenheit')).toBe('185.0 °F')
  })

  it('formats other known units and falls back to a bare count for unknown units', () => {
    expect(formatPhysicalSignalValue(35.04, 'watts', 'celsius')).toBe('35.0 W')
    expect(formatPhysicalSignalValue(1200, 'rpm', 'celsius')).toBe('1200 RPM')
    expect(formatPhysicalSignalValue(42.5, 'percent', 'celsius')).toBe('42.5%')
    expect(formatPhysicalSignalValue(7, 'volts', 'celsius')).toBe('7')
  })
})

describe('formatMilliseconds', () => {
  it('returns em dash for null and non-finite values', () => {
    expect(formatMilliseconds(null)).toBe('—')
    expect(formatMilliseconds(undefined)).toBe('—')
    expect(formatMilliseconds(Number.NaN)).toBe('—')
  })

  it('uses two decimals under 10 and one above', () => {
    expect(formatMilliseconds(0.437)).toBe('0.44 ms')
    expect(formatMilliseconds(12.34)).toBe('12.3 ms')
  })
})

describe('cpuBusyPercent', () => {
  it('clamps the server-computed busy percent into [0, 100]', () => {
    expect(cpuBusyPercent(20)).toBe(20)
    expect(cpuBusyPercent(0)).toBe(0)
    expect(cpuBusyPercent(100)).toBe(100)
    expect(cpuBusyPercent(120)).toBe(100)
    expect(cpuBusyPercent(-5)).toBe(0)
  })

  it('returns null when the value is missing', () => {
    expect(cpuBusyPercent(null)).toBeNull()
    expect(cpuBusyPercent(undefined)).toBeNull()
    expect(cpuBusyPercent(Number.NaN)).toBeNull()
  })

  it('formats through formatCpuBusyPercent', () => {
    expect(formatCpuBusyPercent(20)).toBe('20.0%')
    expect(formatCpuBusyPercent(null)).toBe('—')
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
        })
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
        })
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
