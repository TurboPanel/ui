import { describe, expect, it } from 'vitest'
import type { FleetServerUsageRecord } from '@/lib/instance-api'
import {
  computeFleetStatus,
  fleetServersStatSuffix,
  fleetStatusAccessibilityLabel,
  formatCoresTotal,
  formatSiBytes,
  indexFleetUsageByServerId,
  serverCpuThreads,
  serverInventoryCpuCores,
  type FleetCapacityServer,
} from './fleet-capacity'

function server(
  id: string,
  overrides: Partial<FleetCapacityServer> = {},
): FleetCapacityServer {
  return {
    id,
    connected: false,
    statusChangedAt: '2026-02-01T00:00:00.000Z',
    resources: null,
    ...overrides,
  }
}

function usage(
  serverId: string,
  values: FleetServerUsageRecord['values'],
  sampleCount = 1,
): FleetServerUsageRecord {
  return { serverId, latestAt: '2026-08-17T00:00:00.000Z', sampleCount, values }
}

describe('formatCoresTotal', () => {
  it('renders integers and one-decimal fractions', () => {
    expect(formatCoresTotal(8)).toBe('8')
    expect(formatCoresTotal(8.5)).toBe('8.5')
  })

  it('renders an em dash when unknown or non-positive', () => {
    expect(formatCoresTotal(null)).toBe('—')
    expect(formatCoresTotal(0)).toBe('—')
    expect(formatCoresTotal(Number.NaN)).toBe('—')
  })
})

describe('formatSiBytes', () => {
  it('formats bytes with binary units', () => {
    expect(formatSiBytes(512)).toBe('512 B')
    expect(formatSiBytes(1024)).toBe('1.00 KB')
    expect(formatSiBytes(10 * 1024)).toBe('10.0 KB')
    expect(formatSiBytes(100 * 1024)).toBe('100 KB')
    expect(formatSiBytes(16 * 1024 * 1024 * 1024)).toBe('16.0 GB')
  })

  it('renders an em dash when unknown', () => {
    expect(formatSiBytes(null)).toBe('—')
    expect(formatSiBytes(-1)).toBe('—')
  })
})

describe('serverInventoryCpuCores', () => {
  it('prefers physical cores and falls back to threads', () => {
    expect(
      serverInventoryCpuCores(
        server('a', {
          resources: {
            cpus: [{ cores: { total: 8 }, threads: { total: 16 } }],
          },
        }),
      ),
    ).toBe(8)
    expect(
      serverInventoryCpuCores(
        server('a', {
          resources: { cpus: [{ threads: { total: 16 } }] },
        }),
      ),
    ).toBe(16)
    expect(
      serverInventoryCpuCores(
        server('a', { resources: { cpu: { coreCount: 8, threadCount: 16 } } }),
      ),
    ).toBe(8)
    expect(serverInventoryCpuCores(server('a'))).toBeNull()
  })

  it('sums cores across sockets', () => {
    expect(
      serverInventoryCpuCores(
        server('a', {
          resources: {
            cpus: [
              { cores: { total: 8 }, threads: { total: 16 } },
              { cores: { total: 8 }, threads: { total: 16 } },
            ],
          },
        }),
      ),
    ).toBe(16)
  })
})

describe('serverCpuThreads', () => {
  it('prefers threads and falls back to cores', () => {
    expect(
      serverCpuThreads(
        server('a', {
          resources: {
            cpus: [{ cores: { total: 8 }, threads: { total: 16 } }],
          },
        }),
      ),
    ).toBe(16)
    expect(
      serverCpuThreads(
        server('a', { resources: { cpus: [{ cores: { total: 8 } }] } }),
      ),
    ).toBe(8)
    expect(
      serverCpuThreads(server('a', { resources: { cpu: { coreCount: 8 } } })),
    ).toBe(8)
  })
})

describe('computeFleetStatus', () => {
  it('sums cores, RAM, and online hosts', () => {
    const servers = [
      server('a', {
        connected: true,
        statusChangedAt: '2026-01-01T00:00:00.000Z',
        resources: {
          cpus: [{ cores: { total: 8 }, threads: { total: 16 } }],
          memory: { totalBytes: 8 * 1024 * 1024 * 1024 },
        },
      }),
      server('b', {
        connected: false,
        resources: {
          cpus: [{ cores: { total: 4 } }],
          memory: { totalBytes: 4 * 1024 * 1024 * 1024 },
        },
      }),
      server('c', {
        connected: false,
        statusChangedAt: null,
      }),
    ]
    const status = computeFleetStatus(servers, new Map())
    expect(status).toEqual({
      serverCount: 3,
      onlineCount: 1,
      offlineCount: 1,
      initializingCount: 1,
      totalCores: 12,
      totalMemoryBytes: 12 * 1024 * 1024 * 1024,
    })
  })

  it('falls back to metrics RAM when inventory is absent', () => {
    const servers = [server('a')]
    const usageByServerId = indexFleetUsageByServerId([
      usage('a', {
        memoryUsedBytes: 2 * 1024 * 1024 * 1024,
        memoryAvailableBytes: 6 * 1024 * 1024 * 1024,
      }),
    ])
    expect(computeFleetStatus(servers, usageByServerId).totalMemoryBytes).toBe(
      8 * 1024 * 1024 * 1024,
    )
  })

  it('returns null capacity when nothing is known', () => {
    const status = computeFleetStatus([server('a')], new Map())
    expect(status.totalCores).toBeNull()
    expect(status.totalMemoryBytes).toBeNull()
    expect(status.serverCount).toBe(1)
    expect(status.onlineCount).toBe(0)
    expect(status.offlineCount).toBe(1)
    expect(status.initializingCount).toBe(0)
  })
})

describe('fleetServersStatSuffix', () => {
  it('omits copy when every host is online', () => {
    expect(
      fleetServersStatSuffix({
        serverCount: 2,
        onlineCount: 2,
        offlineCount: 0,
        initializingCount: 0,
        totalCores: null,
        totalMemoryBytes: null,
      }),
    ).toBeUndefined()
  })

  it('names offline beside the online count', () => {
    expect(
      fleetServersStatSuffix({
        serverCount: 5,
        onlineCount: 3,
        offlineCount: 2,
        initializingCount: 0,
        totalCores: null,
        totalMemoryBytes: null,
      }),
    ).toBe('2 offline')
  })

  it('names offline and initializing beside the online count', () => {
    expect(
      fleetServersStatSuffix({
        serverCount: 3,
        onlineCount: 1,
        offlineCount: 1,
        initializingCount: 1,
        totalCores: null,
        totalMemoryBytes: null,
      }),
    ).toBe('1 offline · 1 initializing')
  })
})

describe('fleetStatusAccessibilityLabel', () => {
  it('names online of total without relying on color', () => {
    expect(
      fleetStatusAccessibilityLabel({
        serverCount: 2,
        onlineCount: 1,
        offlineCount: 1,
        initializingCount: 0,
        totalCores: 8,
        totalMemoryBytes: 1024,
      }),
    ).toBe(
      '1 of 2 servers online, 1 offline, total 8 cores, total 1.00 KB RAM',
    )
  })
})
