import { describe, expect, it } from 'vitest'
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

function server(id: string, overrides: Partial<FleetCapacityServer> = {}): FleetCapacityServer {
  return {
    id,
    connected: false,
    statusChangedAt: '2026-02-01T00:00:00.000Z',
    resources: null,
    ...overrides,
  }
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

describe('indexFleetUsageByServerId', () => {
  it('returns an empty map for missing rows', () => {
    expect(indexFleetUsageByServerId(undefined).size).toBe(0)
  })

  it('indexes each usage row by server id', () => {
    const map = indexFleetUsageByServerId([
      {
        serverId: 'srv-a',
        latestAt: null,
        sampleCount: 1,
        values: {},
        derived: {
          cpuUsagePercent: null,
          memoryUsedBytes: null,
          memoryUsedPercent: null,
          swapUsedPercent: null,
          rootFilesystemUsedBytes: null,
          rootFilesystemUsedPercent: null,
        },
      },
    ])
    expect(map.get('srv-a')?.sampleCount).toBe(1)
  })
})

describe('formatSiBytes', () => {
  it('formats bytes with binary units', () => {
    expect(formatSiBytes(512)).toBe('512 B')
    expect(formatSiBytes(1024)).toBe('1.00 KB')
    expect(formatSiBytes(10 * 1024)).toBe('10.0 KB')
    expect(formatSiBytes(100 * 1024)).toBe('100 KB')
    expect(formatSiBytes(16 * 1024 * 1024 * 1024)).toBe('16.0 GB')
    expect(formatSiBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB')
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
        })
      )
    ).toBe(8)
    expect(
      serverInventoryCpuCores(
        server('a', {
          resources: { cpus: [{ threads: { total: 16 } }] },
        })
      )
    ).toBe(16)
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
        })
      )
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
        })
      )
    ).toBe(16)
    expect(serverCpuThreads(server('a', { resources: { cpus: [{ cores: { total: 8 } }] } }))).toBe(
      8
    )
    expect(serverCpuThreads(server('a'))).toBeNull()
    expect(serverCpuThreads(server('a', { resources: { cpus: [] } }))).toBeNull()
    expect(
      serverCpuThreads(
        server('a', {
          resources: { cpus: [{ cores: { total: 0 }, threads: { total: Number.NaN } }] },
        }),
      ),
    ).toBeNull()
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
    const status = computeFleetStatus(servers)
    expect(status).toEqual({
      serverCount: 3,
      onlineCount: 1,
      offlineCount: 1,
      initializingCount: 1,
      totalCores: 12,
      totalMemoryBytes: 12 * 1024 * 1024 * 1024,
    })
  })

  it('returns null capacity when nothing is known', () => {
    const status = computeFleetStatus([server('a')])
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
      })
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
      })
    ).toBe('2 offline')
  })

  it('names initializing beside the online count', () => {
    expect(
      fleetServersStatSuffix({
        serverCount: 2,
        onlineCount: 1,
        offlineCount: 0,
        initializingCount: 1,
        totalCores: null,
        totalMemoryBytes: null,
      })
    ).toBe('1 initializing')
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
      })
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
      })
    ).toBe('1 of 2 servers online, 1 offline, total 8 cores, total 1.00 KB RAM')
  })
})
