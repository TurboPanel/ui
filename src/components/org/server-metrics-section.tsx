import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Button, InlineNotice, SectionPanel, StatTiles } from '@/components/ui'
import {
  CpuMetricIcon,
  MemoryMetricIcon,
  ProcsMetricIcon,
  StorageMetricIcon,
  UptimeMetricIcon,
} from '@/components/icons/metric-icons'
import { ChartCard } from '@/components/org/charts/chart-card'
import { ChartLegend } from '@/components/org/charts/chart-legend'
import {
  MetricLineChart,
  type MetricGapBand,
  type MetricLineSeries,
} from '@/components/org/charts/metric-line-chart'
import { panelStyles } from '@/components/ui/panel-styles'
import { fillSlowFamilyGrid, holdBucketsFor } from '@/lib/metrics-cadence'
import { GROUP_SUMMARY_SPECS, HOST_CHART_GROUPS } from '@/lib/metrics-groups'
import { attributedSignalTitle } from '@/lib/sensor-commands'
import {
  lastFiniteValue,
  type SummaryBar,
  summaryBars,
  type SummaryTone,
  summaryTone,
} from '@/lib/metrics-summary'
import { formatCoresTotal, serverInventoryCpuCores } from '@/lib/fleet-capacity'
import {
  cpuBusyPercent,
  formatAxisTime,
  formatBytes,
  formatBytesPerSecond,
  formatCelsiusAs,
  formatCount,
  formatQueueDepth,
  formatCoveragePercent,
  formatMilliseconds,
  formatOpsPerSecond,
  formatPercent,
  formatPhysicalSignalValue,
  formatUptimeSeconds,
  formatWatts,
  physicalSignalUnitLabel,
  presentSamplesFromGaps,
  type MetricsRangeId,
  type TemperatureUnit,
} from '@/lib/format-metrics'
import {
  formatEntityMetricId,
  MetricsBackendUnavailableError,
  type BlockDeviceInventoryEntry,
  type DerivedHostValues,
  type EntityMetricScope,
  type EntitySeriesResult,
  type FilesystemInventoryEntry,
  type GpuInventoryEntry,
  type HardwareSignalInventoryEntry,
  type MetricEvent,
  type MetricsBackendKind,
  type MetricsSeriesResponse,
  type NetworkInventoryEntry,
  type OrgServerRecord,
  type PerEntityHostedFamily,
  type TopologyInventory,
} from '@/lib/instance-api'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useCan } from '@/lib/query-client'
import {
  useOrgServers,
  useServerMetricsConnection,
  useServerMetricsEvents,
  useServerMetricsSeries,
  useServerMetricsSeriesBatches,
  useServerUpdateStatus,
  useStartServerMetricsLive,
  useStopServerMetricsLive,
  useTriggerServerUpdate,
} from '@/lib/queries/servers'
import { CPU_IOWAIT, CPU_SYSTEM, CPU_USER, usedPercentFromBytes } from '@/lib/server-usage'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

const RANGE_OPTIONS: readonly {
  id: MetricsRangeId
  label: string
}[] = [
  { id: '5m', label: '5m' },
  { id: '10m', label: '10m' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
]

const RANGE_MS: Record<MetricsRangeId, number> = {
  '5m': 300_000,
  '10m': 600_000,
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  '90d': 7_776_000_000,
}

/** Chart refetch cadence while a live-metrics lease is active. */
const LIVE_REFETCH_MS = 10_000

/** Ranges that opt into live sampling — this single-server screen only. */
function isLiveRange(rangeId: MetricsRangeId): boolean {
  return rangeId === '5m' || rangeId === '10m'
}

const SERIES_COLORS = [
  colors.accent,
  colors.command,
  colors.pending,
  colors.errorSoft,
  colors.log,
  colors.textChip,
  CPU_USER,
  CPU_SYSTEM,
  CPU_IOWAIT,
] as const

// ---------------------------------------------------------------------------
// Grid point model — a common shape every chart reads from, whether the
// underlying data is the host-singleton series (`derived` present) or one
// entity's own series (bare field names, no `derived`). Both are aligned
// onto the same bucket timeline so charts from either source can share one
// x-axis domain, gap-band overlay, and generation-break markers.
// ---------------------------------------------------------------------------

type GridPoint = {
  tMs: number
  values: Partial<Record<string, number | null>>
  derived?: DerivedHostValues
}

type PointValueReader = (point: GridPoint) => number | null

/** Read one stored metric by its wire key (canonical name for host, bare field for entities). */
function metric(key: string): PointValueReader {
  return (point) => {
    const value = point.values[key]
    if (value == null || !Number.isFinite(value)) return null
    return value
  }
}

/** Read one server-computed `derived.*` value; missing/non-finite → null. */
function derived(key: keyof DerivedHostValues): PointValueReader {
  return (point) => {
    const value = point.derived?.[key]
    if (value == null || !Number.isFinite(value)) return null
    return value
  }
}

type ChartSeriesDefinition = Readonly<{
  id: string
  label: string
  read: PointValueReader
  /** Explicit series color; falls back to the shared palette by position. */
  color?: string
  /**
   * Drop this series when every sample in range is null — a missing vendor
   * field must not paint an empty legend entry on a chart that still has data.
   */
  hideWhenEmpty?: boolean
}>

type ChartReferenceLine = Readonly<{ value: number; label: string }>

type ChartDefinition = Readonly<{
  id: string
  title: string
  unit: string
  series: readonly ChartSeriesDefinition[]
  yFormat: (value: number) => string
  yDomain?: readonly [number, number]
  area?: boolean
  /** Render series as a cumulative stacked area chart. */
  stacked?: boolean
  /**
   * Omit the whole card when no series has a non-null sample in the range —
   * a missing sensor/entity field must never paint a 0-value flatline.
   */
  hideWhenEmpty?: boolean
  /** Dashed horizontal limit line — raw units, matching the plotted series. */
  referenceLine?: ChartReferenceLine
  /**
   * Null the sample at a topology-generation boundary so a per-device series
   * does not draw one line across two physical identities. Host-scoped charts
   * leave this off — a NIC/GPU swap must not punch a hole in CPU or memory.
   */
  gapOnGenerationBreak?: boolean
}>

/** One resolved chart paired with the grid it reads from — a host chart and an entity chart never share a `points` array. */
type RenderableChart = Readonly<{
  definition: ChartDefinition
  points: GridPoint[]
}>

/**
 * Host-singleton scope shorthand — see `EntityMetricScope`.
 *
 * `cpuDetail`/`memoryDetail` are capability-gated: requested explicitly, and
 * absent entirely on a plan without the capability. Charts built from those
 * scopes must set `hideWhenEmpty: true` so their `CollapsibleChartGroup`
 * self-hides rather than showing an empty section (see
 * `CollapsibleChartGroup`'s `visibleCharts` filter).
 */
type HostScope = Extract<
  EntityMetricScope,
  | 'host.cpu'
  | 'host.kernel'
  | 'host.memory'
  | 'host.storage'
  | 'host.network'
  | 'cpuDetail'
  | 'memoryDetail'
>

/** Every host canonical id this screen ever requests, collected as chart definitions below reference them — see `HOST_METRIC_IDS`. */
const HOST_METRIC_ID_SET = new Set<string>()

function hostMetric(scope: HostScope, field: string): PointValueReader {
  const id = formatEntityMetricId({ scope, field })
  HOST_METRIC_ID_SET.add(id)
  return metric(id)
}

const HOST_CHART_DEFINITIONS: readonly ChartDefinition[] = [
  {
    id: 'cpu-modes',
    title: 'CPU utilization',
    unit: '%',
    // Stacked bottom-up. There is no v5 "nice"/"irq" field (dropped from the
    // contract) — the stack's total tracks `host.cpu.busyPercent` closely,
    // though the two are sampled independently and may not match exactly.
    stacked: true,
    series: [
      { id: 'user', label: 'User', color: CPU_USER, read: hostMetric('host.cpu', 'userPercent') },
      {
        id: 'system',
        label: 'System',
        color: CPU_SYSTEM,
        read: hostMetric('host.cpu', 'systemPercent'),
      },
      {
        id: 'iowait',
        label: 'I/O wait',
        color: CPU_IOWAIT,
        read: hostMetric('host.cpu', 'iowaitPercent'),
      },
      {
        id: 'steal',
        label: 'Steal',
        color: colors.log,
        read: hostMetric('host.cpu', 'stealPercent'),
      },
      {
        id: 'softirq',
        label: 'SoftIRQ',
        color: colors.pending,
        read: hostMetric('host.cpu', 'softirqPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
  },
  {
    id: 'cpu-pressure',
    title: 'CPU pressure (PSI)',
    unit: '%',
    series: [
      { id: 'psi-some', label: 'Some', read: hostMetric('host.cpu', 'pressureSomePercent') },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
    hideWhenEmpty: true,
  },
  {
    id: 'cpu-saturated-cores',
    title: 'Cores saturated',
    unit: 'count',
    series: [
      {
        id: 'saturated-cores',
        label: 'Cores at 90%+',
        read: hostMetric('host.cpu', 'saturatedCoreCount'),
      },
    ],
    yFormat: (v) => formatCount(v),
  },
  {
    id: 'cpu-processes',
    title: 'Processes',
    unit: 'count',
    series: [
      { id: 'total', label: 'Total', read: hostMetric('host.cpu', 'processCount') },
      {
        id: 'running',
        label: 'Runnable',
        read: hostMetric('host.cpu', 'procsRunning'),
      },
      {
        id: 'blocked',
        label: 'Blocked',
        color: colors.pending,
        read: hostMetric('host.cpu', 'procsBlocked'),
      },
    ],
    yFormat: (v) => formatCount(v),
  },
  {
    id: 'memory-breakdown',
    title: 'Memory breakdown',
    unit: 'bytes',
    series: [
      { id: 'used', label: 'Memory used', read: hostMetric('host.memory', 'usedBytes') },
      {
        id: 'cached',
        label: 'Cached files',
        color: colors.pending,
        read: hostMetric('host.memory', 'cachedFilesBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'memory-percent',
    title: 'Memory used',
    unit: '%',
    series: [{ id: 'used', label: 'Used', read: derived('memoryUsedPercent') }],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'swap-bytes',
    title: 'Swap used',
    unit: 'bytes',
    series: [{ id: 'used', label: 'Used', read: hostMetric('host.memory', 'swapUsedBytes') }],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'swap-percent',
    title: 'Swap used %',
    unit: '%',
    series: [{ id: 'used', label: 'Used', read: derived('swapUsedPercent') }],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'memory-pressure',
    title: 'Memory pressure (PSI)',
    unit: '%',
    series: [
      { id: 'some', label: 'Some', read: hostMetric('host.memory', 'pressureSomePercent') },
      {
        id: 'full',
        label: 'Full',
        color: colors.pending,
        read: hostMetric('host.memory', 'pressureFullPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'memory-swap-io',
    title: 'Swap I/O',
    unit: 'B/s',
    series: [
      { id: 'in', label: 'Swap in', read: hostMetric('host.memory', 'swapInBytesPerSecond') },
      {
        id: 'out',
        label: 'Swap out',
        color: colors.pending,
        read: hostMetric('host.memory', 'swapOutBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-major-faults',
    // A *major* fault is a memory access the kernel had to satisfy by reading
    // from disk. "Major page faults" says nothing to an operator; this is the
    // most direct "am I thrashing" signal there is, so it gets named for what
    // it measures and sits next to swap I/O under Paging.
    title: 'Memory reads from disk',
    unit: '/s',
    series: [
      {
        id: 'faults',
        label: 'Reads from disk',
        read: hostMetric('host.memory', 'majorPageFaultsPerSecond'),
      },
    ],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
  {
    id: 'storage-io-pressure',
    title: 'I/O pressure (PSI)',
    unit: '%',
    series: [
      { id: 'some', label: 'Some', read: hostMetric('host.storage', 'ioPressureSomePercent') },
      {
        id: 'full',
        label: 'Full',
        color: colors.pending,
        read: hostMetric('host.storage', 'ioPressureFullPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'disk-throughput',
    title: 'Disk throughput',
    unit: 'B/s',
    series: [
      { id: 'read', label: 'Read', read: hostMetric('host.storage', 'diskReadBytesPerSecond') },
      {
        id: 'write',
        label: 'Write',
        color: colors.pending,
        read: hostMetric('host.storage', 'diskWriteBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    id: 'disk-latency',
    title: 'Disk latency',
    unit: 'ms',
    series: [
      {
        id: 'latency',
        label: 'Service time',
        read: hostMetric('host.storage', 'diskLatencyMs'),
      },
    ],
    yFormat: (v) => formatMilliseconds(v),
  },
  {
    id: 'root-filesystem-bytes',
    title: 'Root filesystem available',
    unit: 'bytes',
    series: [
      {
        id: 'available',
        label: 'Available',
        read: hostMetric('host.storage', 'rootFilesystemAvailableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'root-filesystem-percent',
    title: 'Root filesystem used',
    unit: '%',
    series: [{ id: 'used', label: 'Used', read: derived('rootFilesystemUsedPercent') }],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'root-filesystem-inodes',
    title: 'Root filesystem free inodes',
    unit: 'count',
    series: [
      {
        id: 'free',
        label: 'Free inodes',
        read: hostMetric('host.storage', 'rootFilesystemFreeInodes'),
      },
    ],
    yFormat: (v) => formatCount(v),
  },
  {
    id: 'network-retransmit',
    title: 'TCP retransmit rate',
    unit: '%',
    series: [
      {
        id: 'retransmit',
        label: 'Retransmit',
        read: hostMetric('host.network', 'tcpRetransmitPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'network-softnet-drops',
    title: 'Softnet drops',
    unit: '/s',
    series: [
      {
        id: 'drops',
        label: 'Drops',
        read: hostMetric('host.network', 'softnetDropsPerSecond'),
      },
    ],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
  {
    id: 'kernel-resources',
    title: 'Kernel resource usage',
    unit: '%',
    series: [
      {
        id: 'file-handles',
        label: 'File handles',
        read: hostMetric('host.kernel', 'fileHandlesUsedPercent'),
      },
      {
        id: 'conntrack',
        label: 'Conntrack table',
        color: colors.pending,
        read: hostMetric('host.kernel', 'conntrackUsedPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'cpu-detail-frequency',
    title: 'CPU frequency',
    unit: 'MHz',
    series: [
      { id: 'min', label: 'Min', read: hostMetric('cpuDetail', 'minimumFrequencyMHz') },
      {
        id: 'avg',
        label: 'Avg',
        color: colors.command,
        read: hostMetric('cpuDetail', 'averageFrequencyMHz'),
      },
      {
        id: 'max',
        label: 'Max',
        color: colors.pending,
        read: hostMetric('cpuDetail', 'maximumFrequencyMHz'),
      },
    ],
    yFormat: (v) => `${formatCount(v)} MHz`,
    hideWhenEmpty: true,
  },
  {
    id: 'cpu-detail-scheduling',
    title: 'Context switches & interrupts',
    unit: '/s',
    series: [
      {
        id: 'ctxt',
        label: 'Context switches',
        read: hostMetric('cpuDetail', 'contextSwitchesPerSecond'),
      },
      {
        id: 'intr',
        label: 'Interrupts',
        color: colors.pending,
        read: hostMetric('cpuDetail', 'interruptsPerSecond'),
      },
    ],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
  {
    id: 'cpu-detail-forks',
    title: 'Process forks',
    unit: '/s',
    series: [{ id: 'forks', label: 'Forks', read: hostMetric('cpuDetail', 'forksPerSecond') }],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
  {
    id: 'cpu-detail-irq',
    title: 'IRQ time',
    unit: '%',
    series: [{ id: 'irq', label: 'IRQ', read: hostMetric('cpuDetail', 'cpuIrqPercent') }],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-primary',
    title: 'Free & cached memory',
    unit: 'bytes',
    series: [
      { id: 'free', label: 'Free', read: hostMetric('memoryDetail', 'memoryFreeBytes') },
      {
        id: 'cached',
        label: 'Cached',
        color: colors.command,
        read: hostMetric('memoryDetail', 'cachedBytes'),
      },
      {
        id: 'anon',
        label: 'Anonymous',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'anonPagesBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-slab',
    title: 'Slab memory',
    unit: 'bytes',
    series: [
      {
        id: 'reclaimable',
        label: 'Reclaimable',
        read: hostMetric('memoryDetail', 'slabReclaimableBytes'),
      },
      {
        id: 'unreclaimable',
        label: 'Unreclaimable',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'slabUnreclaimableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-dirty',
    title: 'Dirty & writeback pages',
    unit: 'bytes',
    series: [
      { id: 'dirty', label: 'Dirty', read: hostMetric('memoryDetail', 'dirtyBytes') },
      {
        id: 'writeback',
        label: 'Writeback',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'writebackBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-other-gauges',
    title: 'Shared, page table & kernel stack memory',
    unit: 'bytes',
    series: [
      { id: 'shmem', label: 'Shared', read: hostMetric('memoryDetail', 'shmemBytes') },
      {
        id: 'page-tables',
        label: 'Page tables',
        color: colors.command,
        read: hostMetric('memoryDetail', 'pageTablesBytes'),
      },
      {
        id: 'kernel-stack',
        label: 'Kernel stack',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'kernelStackBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-commit',
    title: 'Committed memory',
    unit: 'bytes',
    series: [
      {
        id: 'committed',
        label: 'Committed',
        read: hostMetric('memoryDetail', 'committedAsBytes'),
      },
      {
        id: 'limit',
        label: 'Limit',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'commitLimitBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-active-inactive',
    title: 'Active & inactive pages',
    unit: 'bytes',
    series: [
      {
        id: 'active-anon',
        label: 'Active anon',
        read: hostMetric('memoryDetail', 'activeAnonBytes'),
      },
      {
        id: 'inactive-anon',
        label: 'Inactive anon',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'inactiveAnonBytes'),
      },
      {
        id: 'active-file',
        label: 'Active file',
        color: colors.command,
        read: hostMetric('memoryDetail', 'activeFileBytes'),
      },
      {
        id: 'inactive-file',
        label: 'Inactive file',
        color: colors.log,
        read: hostMetric('memoryDetail', 'inactiveFileBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-reclaim',
    title: 'Page reclaim',
    unit: '/s',
    series: [
      {
        id: 'scan-direct',
        label: 'Direct scan',
        read: hostMetric('memoryDetail', 'pageScanDirectPerSecond'),
      },
      {
        id: 'scan-kswapd',
        label: 'kswapd scan',
        color: colors.pending,
        read: hostMetric('memoryDetail', 'pageScanKswapdPerSecond'),
      },
    ],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
  {
    id: 'memory-detail-compaction',
    title: 'Compaction stalls',
    unit: '/s',
    series: [
      {
        id: 'stalls',
        label: 'Stalls',
        read: hostMetric('memoryDetail', 'compactionStallsPerSecond'),
      },
    ],
    yFormat: (v) => `${formatCount(v)}/s`,
    hideWhenEmpty: true,
  },
]

/** Every host canonical id referenced by `HOST_CHART_DEFINITIONS` above — the single request list for the host series query. */
const HOST_METRIC_IDS: readonly string[] = [...HOST_METRIC_ID_SET]

// ---------------------------------------------------------------------------
// Per-entity chart builders — GPU / network / filesystem / block device /
// physical-signal groups render dynamically from this server's topology
// inventory. `managed.ingress`/`managed.database_proxy` have no topology
// inventory concept (presence is scrape-derived on the daemon, not
// topology-enumerated), but their `sourceId` space is not open-ended either:
// `IngressAdapterId`/`DatabaseProxyAdapterId` on the daemon are closed unions
// of exactly the adapters that exist (`"caddy" | "traefik"` and
// `"proxysql"`), so — unlike GPU/network/etc. — these entity ids don't need
// discovery at all; they're requested unconditionally, the same way host
// canonical names are, and a source that isn't actually running that tick
// simply comes back absent from `entities[]`.
// ---------------------------------------------------------------------------

/** Bounds the combined entity request under the server's 128-selector cap (`MAX_SERIES_METRIC_SELECTORS_V5`) — see the module doc comment on `buildEntityMetricPlan`. */
const MAX_ENTITY_SELECTORS = 128

const GPU_FIELDS = [
  'utilizationPercent',
  'memoryUsedBytes',
  'memoryActivityPercent',
  'temperatureCelsius',
  'memoryTemperatureCelsius',
  'powerWatts',
  'pcieReceiveBytesPerSecond',
  'pcieTransmitBytesPerSecond',
  'throttlePercent',
] as const

const NETWORK_FIELDS = [
  'receiveBytesPerSecond',
  'transmitBytesPerSecond',
  'receiveErrorsPerSecond',
  'transmitErrorsPerSecond',
  'receiveDropsPerSecond',
  'transmitDropsPerSecond',
] as const

const FILESYSTEM_FIELDS = ['availableBytes', 'freeInodes'] as const

const BLOCK_FIELDS = [
  'readBytesPerSecond',
  'writeBytesPerSecond',
  'readOpsPerSecond',
  'writeOpsPerSecond',
  'readLatencyMs',
  'writeLatencyMs',
  'utilizationPercent',
  'temperatureCelsius',
  'queueDepth',
] as const

const HARDWARE_SIGNAL_FIELDS = ['value'] as const

/** Every `IngressAdapterId` the daemon can ever report — see the module doc comment above. */
const INGRESS_SOURCE_IDS = ['caddy', 'traefik'] as const

/** Every `DatabaseProxyAdapterId` the daemon can ever report — see the module doc comment above. */
const DATABASE_PROXY_SOURCE_IDS = ['proxysql'] as const

const INGRESS_SOURCE_TITLES: Record<string, string> = {
  caddy: 'Caddy',
  traefik: 'Traefik',
}

const DATABASE_PROXY_SOURCE_TITLES: Record<string, string> = {
  proxysql: 'ProxySQL',
}

const INGRESS_FIELDS = [
  'requests',
  'responses2xx',
  'responses3xx',
  'responses4xx',
  'responses5xx',
  'requestErrors',
  'requestBytes',
  'responseBytes',
  'requestDurationSecondsAvg',
  'requestsUnder100ms',
  'requestsUnder500ms',
  'requestsUnder1s',
  'requestsUnder5s',
  'requestsInFlight',
  'upstreamsHealthy',
  'upstreamsTotal',
  'retries',
] as const

const DATABASE_PROXY_FIELDS = [
  'queries',
  'slowQueries',
  'connectionErrors',
  'clientConnections',
  'backendConnections',
  'backendsUp',
] as const

/** Live-only per-core fields — see `CpuCoreLiveSampleV5`. */

type EntityRequestGroup = Readonly<{
  scope: Extract<
    EntityMetricScope,
    | 'network'
    | 'filesystem'
    | 'block'
    | 'gpu'
    | 'hardwareSignal'
    | 'ingress'
    | 'databaseProxy'
    | 'cpuCore'
  >
  entityId: string
  fields: readonly string[]
}>

/**
 * Builds the flattened `{scope, entityId, field}` request list for the
 * entity series query, in family priority order (GPU, network, filesystem,
 * block, hardware signal), then splits it into batches of at most
 * `MAX_ENTITY_SELECTORS` — the server's per-request selector cap. A single
 * entity's fields always land in one batch together (never split across two
 * requests), but different entities of the same family may end up in
 * different batches; every batch is fetched (see
 * `useServerMetricsSeriesBatches`) and their results merged, so a large
 * topology never silently loses devices to truncation.
 */
function buildEntityMetricPlan(inventory: TopologyInventory | null): string[][] {
  const groups: EntityRequestGroup[] = inventory
    ? [
        ...inventory.gpus.map((gpu): EntityRequestGroup => ({
          scope: 'gpu',
          entityId: gpu.gpuId,
          fields: GPU_FIELDS,
        })),
        ...inventory.networks
          // Only monitored NIC slots have a stored series: the daemon samples
          // just those (plus fabric, which has no reconstruction path on
          // either backend and stays unqueryable); every other enumerated
          // device — bond members, VLAN children, tunnels, container bridges,
          // an uplink not on the monitored list — is never sampled.
          .filter((device) => device.role === 'nic')
          .map((device): EntityRequestGroup => ({
            scope: 'network',
            entityId: device.deviceId,
            fields: NETWORK_FIELDS,
          })),
        ...inventory.filesystems
          .filter((fs) => !fs.isRoot)
          .map((fs): EntityRequestGroup => ({
            scope: 'filesystem',
            entityId: fs.filesystemId,
            fields: FILESYSTEM_FIELDS,
          })),
        ...inventory.blockDevices
          .filter((device) => device.isServiceDevice)
          .map((device): EntityRequestGroup => ({
            scope: 'block',
            entityId: device.deviceId,
            fields: BLOCK_FIELDS,
          })),
        ...inventory.hardwareSignals.map((signal): EntityRequestGroup => ({
          scope: 'hardwareSignal',
          entityId: signal.signalId,
          fields: HARDWARE_SIGNAL_FIELDS,
        })),
      ]
    : []

  // Unlike the topology-enumerated families above, ingress/database-proxy
  // entity ids are a fixed closed set (see the module doc comment) — always
  // requested, inventory or not; a source that isn't running just comes back
  // absent from the response.
  groups.push(
    ...INGRESS_SOURCE_IDS.map((entityId): EntityRequestGroup => ({
      scope: 'ingress',
      entityId,
      fields: INGRESS_FIELDS,
    })),
    ...DATABASE_PROXY_SOURCE_IDS.map((entityId): EntityRequestGroup => ({
      scope: 'databaseProxy',
      entityId,
      fields: DATABASE_PROXY_FIELDS,
    })),
  )

  const batches: string[][] = []
  let current: string[] = []
  for (const group of groups) {
    const groupIds = group.fields.map((field) =>
      formatEntityMetricId({ scope: group.scope, entityId: group.entityId, field })
    )
    if (current.length > 0 && current.length + groupIds.length > MAX_ENTITY_SELECTORS) {
      batches.push(current)
      current = []
    }
    current.push(...groupIds)
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** Finds one family's entity result, or a stand-in with no entities when the family wasn't returned (e.g. inventory was empty for it). */
function entityResultFor(
  entities: readonly EntitySeriesResult[],
  family: PerEntityHostedFamily
): EntitySeriesResult | undefined {
  return entities.find((entry) => entry.family === family)
}

/**
 * Merges the `entities[]` from every batched series response into one list,
 * concatenating same-family results — a family whose devices were split
 * across two batches (see `buildEntityMetricPlan`) otherwise loses whichever
 * batch `entityResultFor` doesn't find first.
 */
function mergeEntityBatchResults(
  batches: readonly (MetricsSeriesResponse | undefined)[]
): EntitySeriesResult[] {
  const byFamily = new Map<PerEntityHostedFamily, EntitySeriesResult>()
  for (const batch of batches) {
    if (!batch) continue
    for (const result of batch.entities) {
      const existing = byFamily.get(result.family)
      if (!existing) {
        byFamily.set(result.family, { ...result, entities: [...result.entities] })
        continue
      }
      existing.entities.push(...result.entities)
    }
  }
  return [...byFamily.values()]
}

function asEntityCharts(definitions: ChartDefinition[]): ChartDefinition[] {
  return definitions.map((definition) => ({ ...definition, gapOnGenerationBreak: true }))
}

function gpuChartDefinitions(
  gpu: GpuInventoryEntry,
  temperatureUnit: TemperatureUnit
): ChartDefinition[] {
  const title = `${gpu.vendor} ${gpu.chip}`.trim() || gpu.gpuId
  return asEntityCharts([
    {
      id: `gpu:${gpu.gpuId}:utilization`,
      title: `${title} · Utilization`,
      unit: '%',
      series: [
        { id: 'util', label: 'GPU', read: metric('utilizationPercent') },
        {
          id: 'mem-activity',
          label: 'Memory activity',
          color: colors.command,
          read: metric('memoryActivityPercent'),
          hideWhenEmpty: true,
        },
      ],
      yFormat: (v) => formatPercent(v),
      yDomain: [0, 100],
    },
    {
      id: `gpu:${gpu.gpuId}:memory`,
      title: `${title} · Memory used`,
      unit: 'bytes',
      series: [{ id: 'used', label: 'Used', read: metric('memoryUsedBytes') }],
      yFormat: (v) => formatBytes(v),
      hideWhenEmpty: true,
    },
    {
      id: `gpu:${gpu.gpuId}:temperature`,
      title: `${title} · Temperature`,
      unit: physicalSignalUnitLabel('celsius', temperatureUnit),
      series: [
        { id: 'core', label: 'Core', read: metric('temperatureCelsius') },
        {
          id: 'memory',
          label: 'Memory',
          color: colors.command,
          read: metric('memoryTemperatureCelsius'),
          hideWhenEmpty: true,
        },
      ],
      yFormat: (v) => formatCelsiusAs(v, temperatureUnit),
      hideWhenEmpty: true,
    },
    {
      id: `gpu:${gpu.gpuId}:power`,
      title: `${title} · Power draw`,
      unit: 'W',
      series: [{ id: 'power', label: 'Power', read: metric('powerWatts') }],
      yFormat: (v) => formatWatts(v),
      hideWhenEmpty: true,
    },
    {
      id: `gpu:${gpu.gpuId}:pcie`,
      title: `${title} · PCIe throughput`,
      unit: 'B/s',
      series: [
        { id: 'rx', label: 'Receive', read: metric('pcieReceiveBytesPerSecond') },
        {
          id: 'tx',
          label: 'Transmit',
          color: colors.pending,
          read: metric('pcieTransmitBytesPerSecond'),
        },
      ],
      yFormat: (v) => formatBytesPerSecond(v),
      hideWhenEmpty: true,
    },
    {
      id: `gpu:${gpu.gpuId}:throttle`,
      title: `${title} · Throttle`,
      unit: '%',
      series: [{ id: 'throttle', label: 'Throttle', read: metric('throttlePercent') }],
      yFormat: (v) => formatPercent(v),
      yDomain: [0, 100],
      hideWhenEmpty: true,
    },
  ])
}

function networkDeviceChartDefinitions(device: NetworkInventoryEntry): ChartDefinition[] {
  const title = device.name || device.deviceId
  return asEntityCharts([
    {
      id: `network:${device.deviceId}:throughput`,
      title: `${title} · Throughput`,
      unit: 'B/s',
      series: [
        { id: 'rx', label: 'Receive', read: metric('receiveBytesPerSecond') },
        {
          id: 'tx',
          label: 'Transmit',
          color: colors.pending,
          read: metric('transmitBytesPerSecond'),
        },
      ],
      yFormat: (v) => formatBytesPerSecond(v),
    },
    {
      id: `network:${device.deviceId}:errors`,
      title: `${title} · Errors & drops`,
      unit: '/s',
      series: [
        { id: 'rx-err', label: 'Receive errors', read: metric('receiveErrorsPerSecond') },
        {
          id: 'tx-err',
          label: 'Transmit errors',
          color: colors.pending,
          read: metric('transmitErrorsPerSecond'),
        },
        {
          id: 'rx-drop',
          label: 'Receive drops',
          color: colors.log,
          read: metric('receiveDropsPerSecond'),
        },
        {
          id: 'tx-drop',
          label: 'Transmit drops',
          color: colors.errorSoft,
          read: metric('transmitDropsPerSecond'),
        },
      ],
      yFormat: (v) => `${formatCount(v)}/s`,
      hideWhenEmpty: true,
    },
  ])
}

function filesystemChartDefinitions(fs: FilesystemInventoryEntry): ChartDefinition[] {
  const roleSuffix = fs.roles.length > 0 ? ` (${fs.roles.join(', ')})` : ''
  const title = `${fs.mountpoint}${roleSuffix}`
  return asEntityCharts([
    {
      id: `filesystem:${fs.filesystemId}:available`,
      title: `${title} · Available`,
      unit: 'bytes',
      series: [{ id: 'available', label: 'Available', read: metric('availableBytes') }],
      yFormat: (v) => formatBytes(v),
    },
    {
      id: `filesystem:${fs.filesystemId}:inodes`,
      title: `${title} · Free inodes`,
      unit: 'count',
      series: [{ id: 'free', label: 'Free inodes', read: metric('freeInodes') }],
      yFormat: (v) => formatCount(v),
    },
  ])
}

function blockDeviceChartDefinitions(
  device: BlockDeviceInventoryEntry,
  temperatureUnit: TemperatureUnit
): ChartDefinition[] {
  const title = device.model ? `${device.kernelName} (${device.model})` : device.kernelName
  return asEntityCharts([
    {
      id: `block:${device.deviceId}:throughput`,
      title: `${title} · Throughput`,
      unit: 'B/s',
      series: [
        { id: 'read', label: 'Read', read: metric('readBytesPerSecond') },
        { id: 'write', label: 'Write', color: colors.pending, read: metric('writeBytesPerSecond') },
      ],
      yFormat: (v) => formatBytesPerSecond(v),
    },
    {
      id: `block:${device.deviceId}:iops`,
      title: `${title} · IOPS`,
      unit: 'ops/s',
      series: [
        { id: 'read', label: 'Read', read: metric('readOpsPerSecond') },
        { id: 'write', label: 'Write', color: colors.pending, read: metric('writeOpsPerSecond') },
      ],
      yFormat: (v) => formatOpsPerSecond(v),
    },
    {
      id: `block:${device.deviceId}:latency`,
      title: `${title} · Latency`,
      unit: 'ms',
      series: [
        { id: 'read', label: 'Read', read: metric('readLatencyMs') },
        { id: 'write', label: 'Write', color: colors.pending, read: metric('writeLatencyMs') },
      ],
      yFormat: (v) => formatMilliseconds(v),
    },
    {
      id: `block:${device.deviceId}:utilization`,
      title: `${title} · Utilization`,
      unit: '%',
      series: [{ id: 'util', label: 'Busy', read: metric('utilizationPercent') }],
      yFormat: (v) => formatPercent(v),
      yDomain: [0, 100],
    },
    {
      id: `block:${device.deviceId}:temperature`,
      title: `${title} · Temperature`,
      unit: physicalSignalUnitLabel('celsius', temperatureUnit),
      series: [{ id: 'temp', label: 'Temperature', read: metric('temperatureCelsius') }],
      yFormat: (v) => formatCelsiusAs(v, temperatureUnit),
      hideWhenEmpty: true,
    },
    {
      id: `block:${device.deviceId}:queue-depth`,
      title: `${title} · Queue depth`,
      // Requests in flight, averaged over the interval — `iostat -x`'s
      // `aqu-sz`. Dimensionless, and normally well under 1.
      unit: 'requests',
      series: [{ id: 'depth', label: 'Avg requests in flight', read: metric('queueDepth') }],
      yFormat: (v) => formatQueueDepth(v),
      referenceLine: { value: 1, label: 'Saturated 1.00' },
    },
  ])
}

function hardwareSignalChartDefinition(
  signal: HardwareSignalInventoryEntry,
  temperatureUnit: TemperatureUnit
): ChartDefinition {
  const threshold = signal.thresholds?.critical ?? signal.thresholds?.warning
  const title = attributedSignalTitle(signal)
  return {
    id: `hardware:${signal.signalId}`,
    title,
    unit: physicalSignalUnitLabel(signal.unit, temperatureUnit),
    series: [{ id: 'value', label: title, read: metric('value') }],
    gapOnGenerationBreak: true,
    yFormat: (v) => formatPhysicalSignalValue(v, signal.unit, temperatureUnit),
    referenceLine:
      threshold != null
        ? {
            value: threshold,
            label:
              signal.thresholds?.critical != null
                ? `Critical ${formatPhysicalSignalValue(threshold, signal.unit, temperatureUnit)}`
                : `Warning ${formatPhysicalSignalValue(threshold, signal.unit, temperatureUnit)}`,
          }
        : undefined,
    hideWhenEmpty: true,
  }
}

function ingressChartDefinitions(entityId: string): ChartDefinition[] {
  const title = INGRESS_SOURCE_TITLES[entityId] ?? entityId
  return asEntityCharts([
    {
      id: `ingress:${entityId}:requests`,
      title: `${title} · Requests`,
      unit: 'count',
      series: [
        { id: 'requests', label: 'Requests', read: metric('requests') },
        {
          id: 'errors',
          label: 'Errors',
          color: colors.pending,
          read: metric('requestErrors'),
        },
      ],
      yFormat: (v) => formatCount(v),
    },
    {
      id: `ingress:${entityId}:responses`,
      title: `${title} · Responses by status`,
      unit: 'count',
      stacked: true,
      series: [
        { id: '2xx', label: '2xx', read: metric('responses2xx') },
        { id: '3xx', label: '3xx', color: colors.command, read: metric('responses3xx') },
        { id: '4xx', label: '4xx', color: colors.pending, read: metric('responses4xx') },
        { id: '5xx', label: '5xx', color: colors.errorSoft, read: metric('responses5xx') },
      ],
      yFormat: (v) => formatCount(v),
      hideWhenEmpty: true,
    },
    {
      id: `ingress:${entityId}:throughput`,
      title: `${title} · Throughput`,
      unit: 'bytes',
      series: [
        { id: 'req', label: 'Request bytes', read: metric('requestBytes') },
        {
          id: 'res',
          label: 'Response bytes',
          color: colors.pending,
          read: metric('responseBytes'),
        },
      ],
      yFormat: (v) => formatBytes(v),
      hideWhenEmpty: true,
    },
    {
      id: `ingress:${entityId}:duration`,
      title: `${title} · Avg request duration`,
      unit: 'ms',
      series: [{ id: 'duration', label: 'Duration', read: metric('requestDurationSecondsAvg') }],
      yFormat: (v) => formatMilliseconds(v * 1000),
      hideWhenEmpty: true,
    },
    {
      id: `ingress:${entityId}:latency-buckets`,
      title: `${title} · Requests under threshold`,
      unit: 'count',
      series: [
        { id: 'u100ms', label: '<100ms', read: metric('requestsUnder100ms') },
        {
          id: 'u500ms',
          label: '<500ms',
          color: colors.command,
          read: metric('requestsUnder500ms'),
        },
        { id: 'u1s', label: '<1s', color: colors.pending, read: metric('requestsUnder1s') },
        { id: 'u5s', label: '<5s', color: colors.log, read: metric('requestsUnder5s') },
      ],
      yFormat: (v) => formatCount(v),
      hideWhenEmpty: true,
    },
    {
      id: `ingress:${entityId}:upstreams`,
      title: `${title} · Upstreams & in-flight`,
      unit: 'count',
      series: [
        { id: 'in-flight', label: 'In-flight', read: metric('requestsInFlight') },
        {
          id: 'healthy',
          label: 'Healthy upstreams',
          color: colors.command,
          read: metric('upstreamsHealthy'),
        },
        {
          id: 'total',
          label: 'Total upstreams',
          color: colors.pending,
          read: metric('upstreamsTotal'),
        },
      ],
      yFormat: (v) => formatCount(v),
      hideWhenEmpty: true,
    },
    {
      id: `ingress:${entityId}:retries`,
      title: `${title} · Retries`,
      unit: 'count',
      series: [{ id: 'retries', label: 'Retries', read: metric('retries') }],
      yFormat: (v) => formatCount(v),
      hideWhenEmpty: true,
    },
  ])
}

function databaseProxyChartDefinitions(entityId: string): ChartDefinition[] {
  const title = DATABASE_PROXY_SOURCE_TITLES[entityId] ?? entityId
  return asEntityCharts([
    {
      id: `databaseProxy:${entityId}:queries`,
      title: `${title} · Queries`,
      unit: 'count',
      series: [
        { id: 'queries', label: 'Queries', read: metric('queries') },
        {
          id: 'slow',
          label: 'Slow queries',
          color: colors.pending,
          read: metric('slowQueries'),
        },
      ],
      yFormat: (v) => formatCount(v),
    },
    {
      id: `databaseProxy:${entityId}:connection-errors`,
      title: `${title} · Connection errors`,
      unit: 'count',
      series: [{ id: 'errors', label: 'Errors', read: metric('connectionErrors') }],
      yFormat: (v) => formatCount(v),
      hideWhenEmpty: true,
    },
    {
      id: `databaseProxy:${entityId}:connections`,
      title: `${title} · Connections`,
      unit: 'count',
      series: [
        { id: 'client', label: 'Client', read: metric('clientConnections') },
        {
          id: 'backend',
          label: 'Backend',
          color: colors.pending,
          read: metric('backendConnections'),
        },
      ],
      yFormat: (v) => formatCount(v),
    },
    {
      id: `databaseProxy:${entityId}:backends-up`,
      title: `${title} · Backends up`,
      unit: 'count',
      series: [{ id: 'up', label: 'Backends up', read: metric('backendsUp') }],
      yFormat: (v) => formatCount(v),
    },
  ])
}

type EntityChartGroup = Readonly<{
  id: string
  label: string
  hint: string
  charts: RenderableChart[]
}>

/** Builds every entity-scoped group actually present for this server, from the second (entity) series query's inventory + results. */
function buildEntityChartGroups(
  inventory: TopologyInventory | null,
  entities: readonly EntitySeriesResult[],
  bucketGrid: readonly number[],
  temperatureUnit: TemperatureUnit,
  resolutionSeconds: number
): EntityChartGroup[] {
  function pointsFor(family: PerEntityHostedFamily, entityId: string): GridPoint[] {
    const result = entityResultFor(entities, family)
    const entity = result?.entities.find((entry) => entry.entityId === entityId)
    if (!entity) return bucketGrid.map((tMs) => ({ tMs, values: {} }))
    const byBucket = new Map(entity.points.map((point) => [Date.parse(point.at), point]))
    // Slow-tier families (filesystem, hardware.physical) have no row in most
    // buckets by design — hold each reading across the interval it covers
    // rather than drawing four nulls out of every five.
    return fillSlowFamilyGrid(
      bucketGrid,
      (tMs) => byBucket.get(tMs)?.values,
      holdBucketsFor(family, resolutionSeconds),
      {}
    )
  }

  /** Whether `entityId` actually reported anything for `family` this range — its presence isn't inventory-gated (see the module doc comment). */
  function sourcePresent(family: PerEntityHostedFamily, entityId: string): boolean {
    return (
      entityResultFor(entities, family)?.entities.some(
        (entry) => entry.entityId === entityId && entry.sampleCount > 0
      ) ?? false
    )
  }

  const groups: EntityChartGroup[] = []

  if (inventory) {
    if (inventory.gpus.length > 0) {
      groups.push({
        id: 'gpu',
        label: 'GPU',
        hint: 'Per-device GPU utilization, memory, temperature, and power',
        charts: inventory.gpus.flatMap((gpu) =>
          gpuChartDefinitions(gpu, temperatureUnit).map((definition) => ({
            definition,
            points: pointsFor('gpu', gpu.gpuId),
          }))
        ),
      })
    }

    const queryableNetworkDevices = inventory.networks.filter((device) => device.role === 'nic')
    if (queryableNetworkDevices.length > 0) {
      groups.push({
        id: 'network-devices',
        label: 'Network devices',
        hint: `Monitored network interfaces (the default-route NIC by default; add more under the server's hardware profile) each have their own throughput and error/drop series below. ${TURBOFABRIC_PRODUCT_NAME} mesh interfaces are embedded in host metrics and have no independent series.`,
        charts: queryableNetworkDevices.flatMap((device) =>
          networkDeviceChartDefinitions(device).map((definition) => ({
            definition,
            points: pointsFor('network', device.deviceId),
          }))
        ),
      })
    }

    const nonRootFilesystems = inventory.filesystems.filter((fs) => !fs.isRoot)
    if (nonRootFilesystems.length > 0) {
      groups.push({
        id: 'filesystems',
        label: 'Filesystems',
        hint: 'Non-root mounts — the root filesystem is covered in Storage',
        charts: nonRootFilesystems.flatMap((fs) =>
          filesystemChartDefinitions(fs).map((definition) => ({
            definition,
            points: pointsFor('filesystem', fs.filesystemId),
          }))
        ),
      })
    }

    const serviceBlockDevices = inventory.blockDevices.filter((device) => device.isServiceDevice)
    if (serviceBlockDevices.length > 0) {
      groups.push({
        id: 'block-devices',
        label: 'Block devices',
        hint: 'Per-device throughput, IOPS, latency, and utilization',
        charts: serviceBlockDevices.flatMap((device) =>
          blockDeviceChartDefinitions(device, temperatureUnit).map((definition) => ({
            definition,
            points: pointsFor('block', device.deviceId),
          }))
        ),
      })
    }

    if (inventory.hardwareSignals.length > 0) {
      groups.push({
        id: 'physical-signals',
        label: 'Physical signals',
        hint: 'Temperatures, fans, and power readings reported by this host’s sensors',
        charts: inventory.hardwareSignals.map((signal) => ({
          definition: hardwareSignalChartDefinition(signal, temperatureUnit),
          points: pointsFor('hardware.physical', signal.signalId),
        })),
      })
    }
  }

  const ingressSourcesPresent = INGRESS_SOURCE_IDS.filter((entityId) =>
    sourcePresent('managed.ingress', entityId)
  )
  if (ingressSourcesPresent.length > 0) {
    groups.push({
      id: 'ingress',
      label: 'Ingress',
      hint: 'Per-source Caddy/Traefik request traffic for this host’s managed ingress',
      charts: ingressSourcesPresent.flatMap((entityId) =>
        ingressChartDefinitions(entityId).map((definition) => ({
          definition,
          points: pointsFor('managed.ingress', entityId),
        }))
      ),
    })
  }

  const databaseProxySourcesPresent = DATABASE_PROXY_SOURCE_IDS.filter((entityId) =>
    sourcePresent('managed.database_proxy', entityId)
  )
  if (databaseProxySourcesPresent.length > 0) {
    groups.push({
      id: 'database-proxy',
      label: 'Database proxy',
      hint: 'ProxySQL traffic and backend health for this host\u2019s managed database ingress',
      charts: databaseProxySourcesPresent.flatMap((entityId) =>
        databaseProxyChartDefinitions(entityId).map((definition) => ({
          definition,
          points: pointsFor('managed.database_proxy', entityId),
        }))
      ),
    })
  }

  return groups
}

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

/**
 * Baseline (non-live) refetch cadence. Live ranges fall back to this when the
 * lease is denied, expired, or the server is offline.
 */
type RangeQueryTiming = {
  refetchInterval: number | false
  staleTime: number
}

function rangeQueryTiming(rangeId: MetricsRangeId): RangeQueryTiming {
  if (isLiveRange(rangeId)) {
    return { refetchInterval: 60_000, staleTime: 5_000 }
  }
  if (rangeId === '1h' || rangeId === '6h') {
    return { refetchInterval: 60_000, staleTime: 30_000 }
  }
  if (rangeId === '24h') {
    return { refetchInterval: 300_000, staleTime: 300_000 }
  }
  return { refetchInterval: false, staleTime: 86_400_000 }
}

function liveAwareQueryTiming(liveActive: boolean, baseline: RangeQueryTiming): RangeQueryTiming {
  if (!liveActive) {
    return baseline
  }
  return { refetchInterval: LIVE_REFETCH_MS, staleTime: LIVE_REFETCH_MS / 2 }
}

function metricsResolutionLabel(resolutionSeconds: number | null | undefined): string {
  if (resolutionSeconds == null) {
    return 'auto'
  }
  return `${resolutionSeconds}s`
}

function computeRangeBounds(rangeId: MetricsRangeId): {
  fromIso: string
  toIso: string
  fromMs: number
  toMs: number
} {
  const toMs = Date.now()
  const fromMs = toMs - RANGE_MS[rangeId]
  return {
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromMs,
    toMs,
  }
}

function isServerStale(server: OrgServerRecord | null): boolean {
  if (!server) return true
  return !server.connected
}

function bucketFloor(ms: number, resolutionSeconds: number): number {
  const bucketMs = resolutionSeconds * 1000
  return Math.floor(ms / bucketMs) * bucketMs
}

function defaultExpectedSamplesPerBucket(resolutionSeconds: number): number {
  return Math.max(1, Math.round(resolutionSeconds / 60))
}

type NormalizedHostGrid = {
  points: GridPoint[]
  gapBands: MetricGapBand[]
  expectedSamples: number
  fromMs: number
  toMs: number
  bucketGrid: number[]
}

/**
 * Builds the shared bucket timeline and aligns the host series onto it,
 * gap-filling missing buckets with null-valued points. Entity charts reuse
 * `bucketGrid` (and this same `gapBands`/coverage) rather than computing
 * their own — one daemon POST per sampling tick writes every family
 * together, so a host-level gap means every family's series has one too.
 *
 * Amber bands mark buckets with no samples (a hole in the line). A live
 * bucket that landed some points but fewer than `expectedSampleCount` still
 * plots — coverage accounting keeps the shortfall, the overlay does not.
 */
function normalizeHostGrid(data: MetricsSeriesResponse): NormalizedHostGrid {
  const fromMs = Date.parse(data.from)
  const toMs = Date.parse(data.to)
  const resolutionSeconds = data.resolutionSeconds
  const host = data.host

  if (
    !host ||
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    !resolutionSeconds ||
    resolutionSeconds <= 0
  ) {
    return {
      points: (host?.points ?? []).map((point) => ({
        tMs: Date.parse(point.at),
        values: point.values,
        derived: point.derived,
      })),
      gapBands: [],
      expectedSamples: host ? host.sampleCount + host.gapCount : 0,
      fromMs: Number.isFinite(fromMs) ? fromMs : 0,
      toMs: Number.isFinite(toMs) ? toMs : 0,
      bucketGrid: [],
    }
  }

  const bucketMs = resolutionSeconds * 1000
  const startMs = bucketFloor(fromMs, resolutionSeconds)
  const endMs = bucketFloor(toMs, resolutionSeconds)
  const defaultExpected = defaultExpectedSamplesPerBucket(resolutionSeconds)

  const pointByBucket = new Map(
    host.points.map((point) => [bucketFloor(Date.parse(point.at), resolutionSeconds), point])
  )

  const points: GridPoint[] = []
  const gapBands: MetricGapBand[] = []
  const bucketGrid: number[] = []
  let expectedSamples = 0

  for (let bucket = startMs; bucket < endMs; bucket += bucketMs) {
    bucketGrid.push(bucket)
    const existing = pointByBucket.get(bucket)
    const band = { fromMs: bucket, toMs: bucket + bucketMs }

    if (!existing) {
      expectedSamples += defaultExpected
      gapBands.push(band)
      points.push({ tMs: bucket, values: {} })
      continue
    }

    const expected = existing.expectedSampleCount ?? defaultExpected
    expectedSamples += expected
    if (existing.sampleCount <= 0) {
      gapBands.push(band)
    }
    points.push({
      tMs: bucket,
      values: existing.values,
      derived: existing.derived,
    })
  }

  return { points, gapBands, expectedSamples, fromMs: startMs, toMs: endMs, bucketGrid }
}

/**
 * Maps grid points through a chart's readers. Per-device charts may also
 * null the topology-generation boundary (see {@link ChartDefinition.gapOnGenerationBreak}).
 */
function buildChartSeries(
  points: GridPoint[],
  definition: ChartDefinition,
  breakMs?: ReadonlySet<number>
): MetricLineSeries[] {
  const nullAtBreaks = Boolean(definition.gapOnGenerationBreak && breakMs && breakMs.size > 0)
  return definition.series.flatMap((entry, index) => {
    const mapped: MetricLineSeries = {
      key: entry.id,
      label: entry.label,
      color: entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length]!,
      points: points.map((point) => ({
        tMs: point.tMs,
        value: nullAtBreaks && breakMs?.has(point.tMs) ? null : entry.read(point),
      })),
    }
    if (
      entry.hideWhenEmpty &&
      mapped.points.every((point) => point.value === null || point.value === undefined)
    ) {
      return []
    }
    return [mapped]
  })
}

/** True when any series in the chart has at least one non-null sample. */
function chartHasAnyData(points: GridPoint[], definition: ChartDefinition): boolean {
  return definition.series.some((entry) => points.some((point) => entry.read(point) != null))
}

function isChartUnavailable(series: MetricLineSeries[]): boolean {
  return series.every((entry) =>
    entry.points.every((point) => point.value === null || point.value === undefined)
  )
}

function lastFormattedValue(
  series: MetricLineSeries[],
  yFormat: (value: number) => string
): string {
  for (const entry of [...series].reverse()) {
    for (const point of [...entry.points].reverse()) {
      if (point.value !== null && point.value !== undefined) {
        return yFormat(point.value)
      }
    }
  }
  return '—'
}

/**
 * Headline for a stacked chart: the sum of every visible series at the most
 * recent index where at least one has a sample.
 */
function lastStackedTotal(series: MetricLineSeries[], yFormat: (value: number) => string): string {
  const pointCount = series[0]?.points.length ?? 0
  for (let index = pointCount - 1; index >= 0; index -= 1) {
    let sum = 0
    let any = false
    for (const entry of series) {
      const value = entry.points[index]?.value
      if (value === null || value === undefined) continue
      sum += value
      any = true
    }
    if (any) return yFormat(sum)
  }
  return '—'
}

type MetricsViewState =
  'loading' | 'unsupported-os' | 'backend-unavailable' | 'not-configured' | 'no-data' | 'charts'

function metricsBackendLabel(backend: MetricsBackendKind): string {
  switch (backend) {
    case 'analytics-engine':
      return 'Analytics Engine'
    case 'duckdb':
      return 'DuckDB'
    default:
      return 'metrics storage'
  }
}

function metricsNotConfiguredCopy(backend: MetricsBackendKind): string {
  if (backend === 'duckdb') {
    return 'Metrics storage is still starting up (DuckDB). Retry in a moment.'
  }
  return 'Metrics storage is not configured for this runtime yet.'
}

function resolveViewState(
  server: OrgServerRecord | null | undefined,
  data: MetricsSeriesResponse | undefined,
  error: unknown
): MetricsViewState {
  if (server?.os?.family && server.os.family !== 'linux') {
    return 'unsupported-os'
  }
  if (error instanceof MetricsBackendUnavailableError) {
    return 'backend-unavailable'
  }
  if (!data) {
    return 'loading'
  }
  if (!data.available) {
    return 'not-configured'
  }
  if (!data.host || data.host.points.length === 0 || data.host.sampleCount === 0) {
    return 'no-data'
  }
  return 'charts'
}

function noDataCopy(
  updateAvailable: boolean,
  updating: boolean
): {
  title: string
  body: string
} {
  if (updating) {
    return {
      title: 'Daemon is updating',
      body: 'The daemon on this host is installing a new build. Metrics will appear after it reconnects.',
    }
  }
  if (updateAvailable) {
    return {
      title: 'Daemon update available',
      body: 'A newer daemon build is available. Update this host to the current build; samples appear after it reconnects and begins reporting.',
    }
  }
  return {
    title: 'Waiting for first samples',
    body: 'No server metrics yet. Samples appear about one minute after the daemon connects and begins reporting.',
  }
}

function metricsErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Failed to load metrics'
}

function RangePicker({
  rangeId,
  onChange,
}: Readonly<{
  rangeId: MetricsRangeId
  onChange: (id: MetricsRangeId) => void
}>) {
  return (
    <View style={styles.rangeRow}>
      <Text style={styles.rangeLabel}>Time range</Text>
      <View style={panelStyles.segmentGroup}>
        {RANGE_OPTIONS.map((option) => {
          const active = option.id === rangeId
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                panelStyles.segmentChip,
                active ? panelStyles.segmentChipActive : null,
                pressed && styles.rangeChipPressed,
                webPointer,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show ${option.label} range`}
            >
              <Text
                style={[
                  panelStyles.segmentChipText,
                  active ? panelStyles.segmentChipTextActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={styles.rangeHint}>Shorter ranges auto-refresh while this page is open.</Text>
    </View>
  )
}

type StateTone = 'neutral' | 'warn' | 'error' | 'info'

function stateToneStyles(tone: StateTone): {
  border: string
  stripe: string
  title: string
} {
  switch (tone) {
    case 'warn':
      return { border: colors.pending, stripe: colors.pending, title: colors.pending }
    case 'error':
      return { border: colors.error, stripe: colors.error, title: colors.errorText }
    case 'info':
      return { border: colors.command, stripe: colors.command, title: colors.command }
    default:
      return { border: colors.borderArea, stripe: colors.accent, title: colors.textTitle }
  }
}

function MetricsStateBlock({
  title,
  body,
  tone = 'neutral',
  action,
}: Readonly<{
  title: string
  body: string
  tone?: StateTone
  action?: ReactNode
}>) {
  const toneStyle = stateToneStyles(tone)

  return (
    <View
      style={[
        panelStyles.statePanel,
        styles.stateBlock,
        { borderColor: toneStyle.border, borderLeftColor: toneStyle.stripe },
      ]}
    >
      <Text style={[panelStyles.statePanelTitle, { color: toneStyle.title }]}>{title}</Text>
      <Text style={panelStyles.muted}>{body}</Text>
      {action}
    </View>
  )
}

function MetricsStatusMessages({
  viewState,
  backend,
  isLoading,
  hasData,
  queryError,
  onRetry,
  updateAvailable,
  updating,
  canUpdate,
  updateBusy,
  onUpdate,
}: Readonly<{
  viewState: MetricsViewState
  backend: MetricsBackendKind
  isLoading: boolean
  hasData: boolean
  queryError: unknown
  onRetry: () => void
  updateAvailable: boolean
  updating: boolean
  canUpdate: boolean
  updateBusy: boolean
  onUpdate: () => void
}>) {
  const showGenericError =
    queryError != null && !(queryError instanceof MetricsBackendUnavailableError)
  const unavailableBackend =
    queryError instanceof MetricsBackendUnavailableError ? queryError.backend : backend
  const emptyCopy = noDataCopy(updateAvailable, updating)
  const showUpdateAction = updateAvailable && canUpdate && !updating

  return (
    <>
      {isLoading && !hasData ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={panelStyles.muted}>Loading metrics…</Text>
        </View>
      ) : null}

      {showGenericError ? (
        <MetricsStateBlock
          tone="error"
          title="Could not load metrics"
          body={metricsErrorMessage(queryError)}
        />
      ) : null}

      {viewState === 'unsupported-os' ? (
        <MetricsStateBlock
          tone="warn"
          title="Unsupported operating system"
          body="Server metrics are collected from Linux hosts only. This server reports a non-Linux OS family."
        />
      ) : null}

      {viewState === 'backend-unavailable' ? (
        <MetricsStateBlock
          tone="error"
          title="Metrics store unavailable"
          body={`Could not reach ${metricsBackendLabel(unavailableBackend)}. Charts will resume when storage is reachable.`}
          action={
            <Pressable
              style={({ pressed }) => [
                panelStyles.toolbarBtnSecondary,
                pressed && styles.rangeChipPressed,
                webPointer,
              ]}
              onPress={onRetry}
            >
              <Text style={panelStyles.toolbarBtnTextSecondary}>Retry</Text>
            </Pressable>
          }
        />
      ) : null}

      {viewState === 'not-configured' ? (
        <MetricsStateBlock
          tone="info"
          title="Metrics not configured"
          body={metricsNotConfiguredCopy(backend)}
        />
      ) : null}

      {viewState === 'no-data' ? (
        <MetricsStateBlock
          tone={updateAvailable || updating ? 'warn' : 'neutral'}
          title={emptyCopy.title}
          body={emptyCopy.body}
          action={
            showUpdateAction ? (
              <Button
                label="Update daemon"
                variant="primary"
                busy={updateBusy}
                busyLabel="Updating…"
                onPress={onUpdate}
              />
            ) : undefined
          }
        />
      ) : null}
    </>
  )
}

/**
 * Legend chips beyond this count collapse into a single "Other" chip.
 */
const MAX_VISIBLE_LEGEND_ENTRIES = 5

function MetricsChartCard({
  chart,
  chartDomainMs,
  gapBands,
  xTickFormat,
  breakLines,
}: Readonly<{
  chart: RenderableChart
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
  breakLines?: readonly number[]
}>) {
  const { definition, points } = chart
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(() => new Set())
  const toggleSeries = useCallback(
    (keys: readonly string[]) => {
      setHiddenKeys((prev) => {
        const allHidden = keys.every((key) => prev.has(key))
        const next = new Set(prev)
        for (const key of keys) {
          if (allHidden) {
            next.delete(key)
          } else {
            next.add(key)
          }
        }
        if (next.size >= definition.series.length) return prev
        return next
      })
    },
    [definition.series.length]
  )

  const breakMs = useMemo(
    () => (breakLines && breakLines.length > 0 ? new Set(breakLines) : undefined),
    [breakLines]
  )
  const series = buildChartSeries(points, definition, breakMs)
  const unavailable = isChartUnavailable(series)
  const visibleSeries =
    series.length > 1 ? series.filter((entry) => !hiddenKeys.has(entry.key)) : series
  const headline = definition.stacked
    ? lastStackedTotal(visibleSeries, definition.yFormat)
    : lastFormattedValue(visibleSeries, definition.yFormat)

  const overflowAt =
    series.length > MAX_VISIBLE_LEGEND_ENTRIES ? MAX_VISIBLE_LEGEND_ENTRIES - 1 : series.length
  const primarySeries = series.slice(0, overflowAt)
  const overflowSeries = series.slice(overflowAt)

  const legendEntries = primarySeries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    lastValue: lastFormattedValue([entry], definition.yFormat),
    hidden: hiddenKeys.has(entry.key),
    onPress: series.length > 1 ? () => toggleSeries([entry.key]) : undefined,
  }))
  if (overflowSeries.length > 0) {
    const overflowKeys = overflowSeries.map((entry) => entry.key)
    legendEntries.push({
      key: '__other__',
      label: `Other (${overflowSeries.length})`,
      color: colors.textMuted,
      lastValue: lastStackedTotal(overflowSeries, definition.yFormat),
      hidden: overflowKeys.every((key) => hiddenKeys.has(key)),
      onPress: () => toggleSeries(overflowKeys),
    })
  }

  const referenceLine = definition.referenceLine
    ? {
        valueY: definition.referenceLine.value,
        label: definition.referenceLine.label,
        color: colors.pending,
      }
    : undefined

  return (
    <ChartCard
      title={definition.title}
      subtitle={definition.unit}
      headline={unavailable ? undefined : headline}
      legend={<ChartLegend entries={legendEntries} />}
      unavailable={unavailable}
    >
      <MetricLineChart
        series={visibleSeries}
        xDomainMs={chartDomainMs}
        height={220}
        yFormat={definition.yFormat}
        yDomain={definition.yDomain}
        area={definition.area}
        stacked={definition.stacked}
        gapBands={gapBands}
        xTickFormat={xTickFormat}
        referenceLine={referenceLine}
        breakLines={breakLines}
      />
    </ChartCard>
  )
}

/**
 * Collapsed-section summary: the group's headline figure, an 8-bucket bar
 * chart of its primary series, and a state chip when a threshold is crossed.
 * `null` for a group with no summary spec, or whose primary chart isn't
 * present this range.
 */
function summarizeGroup(
  groupId: string,
  charts: readonly RenderableChart[]
): { figure: string; bars: SummaryBar[]; tone: SummaryTone } | null {
  const spec = GROUP_SUMMARY_SPECS[groupId]
  if (!spec) return null
  const chart = charts.find((candidate) => candidate.definition.id === spec.chartId)
  if (!chart) return null
  const series = spec.seriesId
    ? chart.definition.series.find((entry) => entry.id === spec.seriesId)
    : chart.definition.series[0]
  if (!series) return null

  // A stacked chart's headline is the stack total, not its first band.
  const values = chart.points.map((point) =>
    chart.definition.stacked
      ? chart.definition.series.reduce<number | null>((total, entry) => {
          const value = entry.read(point)
          return value === null ? total : (total ?? 0) + value
        }, null)
      : series.read(point)
  )
  const latest = lastFiniteValue(values)
  return {
    figure: latest === null ? '—' : chart.definition.yFormat(latest),
    bars: summaryBars(values, 8, spec.max),
    tone: spec.thresholds ? summaryTone(latest, spec.thresholds) : null,
  }
}

/**
 * The mini bar chart itself — plain flex children with percentage heights.
 * No charting library and no SVG: it renders from points the page already
 * has, so a collapsed section costs nothing extra to draw.
 */
function SummaryBars({
  bars,
  tone,
}: Readonly<{ bars: SummaryBar[]; tone: SummaryTone }>) {
  return (
    <View style={styles.summaryBars} accessibilityElementsHidden importantForAccessibility="no">
      {bars.map((bar, index) => (
        <View
          key={index}
          style={[
            styles.summaryBar,
            // A gap stays visibly empty rather than reading as a zero.
            bar === null
              ? styles.summaryBarGap
              : {
                  height: `${Math.max(6, bar * 100)}%`,
                  backgroundColor:
                    tone === 'critical'
                      ? colors.error
                      : tone === 'warning'
                        ? colors.pending
                        : colors.accent,
                },
          ]}
        />
      ))}
    </View>
  )
}

function CollapsibleChartGroup({
  id,
  label,
  hint,
  expandedGroups,
  onToggle,
  twoColumn,
  charts,
  chartDomainMs,
  gapBands,
  xTickFormat,
  breakLines,
}: Readonly<{
  id: string
  label: string
  hint: string
  expandedGroups: ReadonlySet<string>
  onToggle: (id: string, expanded: boolean) => void
  twoColumn: boolean
  charts: RenderableChart[]
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
  breakLines?: readonly number[]
}>) {
  // Collapse state is owned by the screen, not by this component: a local
  // `useState` reset on every range change, which is why the sections used to
  // spring back open mid-session.
  const expanded = expandedGroups.has(id)
  const setExpanded = (next: (open: boolean) => boolean) => onToggle(id, next(expanded))
  // hideWhenEmpty cards drop out entirely when nothing reported in range — a
  // missing sensor/entity field is absence, not zero.
  const visibleCharts = charts.filter(
    (chart) => !chart.definition.hideWhenEmpty || chartHasAnyData(chart.points, chart.definition)
  )

  const summary = summarizeGroup(id, visibleCharts)

  if (visibleCharts.length === 0) return null

  return (
    <View style={styles.chartGroup}>
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [
          styles.chartGroupHeader,
          expanded && styles.chartGroupHeaderExpanded,
          pressed && styles.rangeChipPressed,
          webPointer,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${label} charts`}
      >
        <Text style={[styles.chartGroupChevron, expanded && styles.chartGroupChevronOpen]}>
          {expanded ? '▾' : '▸'}
        </Text>
        <View style={styles.chartGroupCopy}>
          <Text style={styles.chartGroupTitle}>{label}</Text>
          <Text style={styles.chartGroupHint}>{hint}</Text>
        </View>
        {summary ? (
          <View style={styles.groupSummary}>
            <Text style={styles.groupSummaryFigure}>{summary.figure}</Text>
            <SummaryBars bars={summary.bars} tone={summary.tone} />
            {summary.tone ? (
              <View
                style={[
                  styles.groupSummaryChip,
                  summary.tone === 'critical' && styles.groupSummaryChipCritical,
                ]}
              >
                <Text style={styles.groupSummaryChipText}>
                  {summary.tone === 'critical' ? 'Critical' : 'Warning'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.chartGroupCount, expanded && styles.chartGroupCountActive]}>
          <Text style={[styles.chartGroupCountText, expanded && styles.chartGroupCountTextActive]}>
            {visibleCharts.length}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <View style={[styles.chartGrid, twoColumn ? styles.chartGridTwo : null]}>
          {visibleCharts.map((chart) => (
            <MetricsChartCard
              key={chart.definition.id}
              chart={chart}
              chartDomainMs={chartDomainMs}
              gapBands={gapBands}
              xTickFormat={xTickFormat}
              breakLines={breakLines}
            />
          ))}
        </View>
      ) : null}
      {id === 'network' ? (
        <Text style={styles.chartGroupNote}>
          {TURBOFABRIC_PRODUCT_NAME} mesh interfaces are embedded in host metrics on this version
          and have no independent series — see Network devices for the host&apos;s individual NICs.
        </Text>
      ) : null}
    </View>
  )
}

function processOverviewLabel(
  processCount: number | null,
  procsRunning: number | null,
  procsBlocked: number | null
): string {
  if (processCount != null) return formatCount(processCount)
  if (procsRunning == null && procsBlocked == null) return '—'
  return `${formatCount(procsRunning)} / ${formatCount(procsBlocked ?? 0)}`
}

function latestReadValue(points: GridPoint[], read: PointValueReader): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = read(points[index]!)
    if (value != null) return value
  }
  return null
}

const SEVERITY_LABEL: Record<MetricEvent['severity'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

function severityToneColor(severity: MetricEvent['severity']): string {
  if (severity === 'critical') return colors.error
  if (severity === 'warning') return colors.pending
  return colors.textDim
}

function MetricsEventsPanel({ events }: Readonly<{ events: MetricEvent[] }>) {
  if (events.length === 0) return null
  const recent = [...events].reverse().slice(0, 20)
  return (
    <SectionPanel title="Recent events" hint="Hardware-health and lifecycle notices in range">
      <View style={styles.eventsList}>
        {recent.map((event) => (
          <View key={event.eventId} style={styles.eventRow}>
            <View
              style={[styles.eventDot, { backgroundColor: severityToneColor(event.severity) }]}
            />
            <View style={styles.eventCopy}>
              <Text style={styles.eventKind}>{event.kind}</Text>
              <Text style={styles.eventMeta}>
                {SEVERITY_LABEL[event.severity]}
                {event.entityId ? ` · ${event.entityId}` : ''}
                {event.source ? ` · ${event.source}` : ''}
                {' · '}
                {new Date(event.at).toLocaleString()}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </SectionPanel>
  )
}

/** Latest-value rollup above the chart groups — derived numbers, not a chart. */
function MetricsOverviewTiles({
  hostPoints,
  entityGroups,
  inventory,
  server,
  uptimeSeconds,
}: Readonly<{
  hostPoints: GridPoint[]
  entityGroups: EntityChartGroup[]
  inventory: TopologyInventory | null
  server: OrgServerRecord | null
  uptimeSeconds: number | null
}>) {
  const cpuBusyId = formatEntityMetricId({ scope: 'host.cpu', field: 'busyPercent' })
  const cpuBusy = cpuBusyPercent(latestReadValue(hostPoints, metric(cpuBusyId)))
  const cpuCores = server ? serverInventoryCpuCores(server) : null
  const cpuModel = server?.resources?.cpus?.[0]?.name ?? null
  const cpuHardwareLabel = [
    cpuCores != null ? `${formatCoresTotal(cpuCores)} cores` : null,
    cpuModel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  const memoryUsed = latestReadValue(hostPoints, derived('memoryUsedPercent'))

  // The hosting-role filesystem's used % — the host grid already carries it
  // via `derived.rootFilesystemUsedPercent` when that filesystem is root;
  // otherwise it's computed from its own entity chart's latest available
  // bytes plus the inventory-reported total (no second request needed — the
  // entity series query already fetches every non-root filesystem).
  const hostingFilesystem =
    inventory?.filesystems.find((fs) => fs.roles.includes('hosting')) ??
    inventory?.filesystems.find((fs) => fs.isRoot) ??
    null
  const hostingUsed = (() => {
    if (!hostingFilesystem) return null
    if (hostingFilesystem.isRoot) {
      return latestReadValue(hostPoints, derived('rootFilesystemUsedPercent'))
    }
    const filesystemsGroup = entityGroups.find((group) => group.id === 'filesystems')
    const availableChart = filesystemsGroup?.charts.find(
      (chart) => chart.definition.id === `filesystem:${hostingFilesystem.filesystemId}:available`
    )
    if (!availableChart) return null
    const availableBytes = latestReadValue(availableChart.points, metric('availableBytes'))
    return usedPercentFromBytes(hostingFilesystem.totalBytes, availableBytes)
  })()

  const processCount = latestReadValue(
    hostPoints,
    metric(formatEntityMetricId({ scope: 'host.cpu', field: 'processCount' }))
  )
  const procsRunning = latestReadValue(
    hostPoints,
    metric(formatEntityMetricId({ scope: 'host.cpu', field: 'procsRunning' }))
  )
  const procsBlocked = latestReadValue(
    hostPoints,
    metric(formatEntityMetricId({ scope: 'host.cpu', field: 'procsBlocked' }))
  )
  const processesLabel = processOverviewLabel(processCount, procsRunning, procsBlocked)
  const processesTileLabel = processCount != null ? 'PROCESSES' : 'RUNNING / BLOCKED'
  const processesA11y =
    processCount != null
      ? `${processesLabel} processes, ${formatCount(procsRunning)} runnable, ${formatCount(procsBlocked ?? 0)} blocked`
      : `${processesLabel} running / blocked processes`

  return (
    <>
      <StatTiles
        accessibilityLabel="Latest server metrics"
        items={[
          {
            key: 'cpu',
            icon: CpuMetricIcon,
            value: formatPercent(cpuBusy),
            label: 'CPU UTILIZATION',
            accessibilityLabel: `CPU utilization ${formatPercent(cpuBusy)}`,
          },
          {
            key: 'memory',
            icon: MemoryMetricIcon,
            value: formatPercent(memoryUsed),
            label: 'MEMORY USED',
            accessibilityLabel: `Memory used ${formatPercent(memoryUsed)}`,
          },
          {
            key: 'storage',
            icon: StorageMetricIcon,
            value: formatPercent(hostingUsed),
            label: 'HOSTING STORAGE USED',
            accessibilityLabel: `Hosting storage used ${formatPercent(hostingUsed)}`,
          },
          {
            key: 'processes',
            icon: ProcsMetricIcon,
            value: processesLabel,
            label: processesTileLabel,
            accessibilityLabel: processesA11y,
          },
          {
            key: 'uptime',
            icon: UptimeMetricIcon,
            value: formatUptimeSeconds(uptimeSeconds),
            label: 'UPTIME',
            accessibilityLabel: `Uptime ${formatUptimeSeconds(uptimeSeconds)}`,
          },
        ]}
      />
      {cpuHardwareLabel ? (
        <Text style={styles.hardwareCaption} numberOfLines={1}>
          {cpuHardwareLabel}
        </Text>
      ) : null}
    </>
  )
}

type LiveSessionState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'live'
      leaseId: string
      intervalSeconds: number
      expiresAtMs: number
    }
  | { kind: 'ended' }
  | { kind: 'disabled' }
  | { kind: 'offline' }

/**
 * Live-metrics lease lifecycle for the 5m/10m ranges. Acquires a lease while
 * `active`, tracks its expiry, and releases it (fire-and-forget) as soon as
 * the range changes or the screen unmounts.
 */
function useLiveMetricsSession(
  orgId: string,
  serverId: string,
  active: boolean,
  rangeId: MetricsRangeId
): { state: LiveSessionState; restart: () => void } {
  const startMutation = useStartServerMetricsLive(orgId, serverId)
  const stopMutation = useStopServerMetricsLive(orgId, serverId)
  const startLive = startMutation.mutateAsync
  const stopLive = stopMutation.mutateAsync

  const [state, setState] = useState<LiveSessionState>({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const leaseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setState({ kind: 'starting' })
    void (async () => {
      let outcome
      try {
        outcome = await startLive(undefined)
      } catch {
        if (!cancelled) setState({ kind: 'idle' })
        return
      }
      if (cancelled) {
        if (outcome.kind === 'started') {
          stopLive(outcome.leaseId).catch(() => {})
        }
        return
      }
      if (outcome.kind === 'started') {
        leaseRef.current = outcome.leaseId
        setState({
          kind: 'live',
          leaseId: outcome.leaseId,
          intervalSeconds: outcome.intervalSeconds,
          expiresAtMs: Date.parse(outcome.expiresAt),
        })
        return
      }
      setState({ kind: outcome.kind })
    })()
    return () => {
      cancelled = true
      const leaseId = leaseRef.current
      leaseRef.current = null
      if (leaseId) {
        stopLive(leaseId).catch(() => {
          // Best effort — the daemon's local expiry timer is the backstop.
        })
      }
      setState({ kind: 'idle' })
    }
  }, [active, rangeId, orgId, serverId, attempt, startLive, stopLive])

  useEffect(() => {
    if (state.kind !== 'live') return
    const delayMs = state.expiresAtMs - Date.now()
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      leaseRef.current = null
      setState({ kind: 'ended' })
      return
    }
    const timer = setTimeout(() => {
      leaseRef.current = null
      setState({ kind: 'ended' })
    }, delayMs)
    return () => clearTimeout(timer)
  }, [state])

  const restart = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, restart }
}

function LiveModeIndicator({
  state,
  onRestart,
}: Readonly<{ state: LiveSessionState; onRestart: () => void }>) {
  if (state.kind === 'starting') {
    return (
      <View style={styles.liveRow}>
        <ActivityIndicator size="small" color={colors.green} />
        <Text style={panelStyles.muted}>Starting live session…</Text>
      </View>
    )
  }
  if (state.kind === 'live') {
    return (
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
        <Text style={styles.liveMeta}>· {state.intervalSeconds} second sampling</Text>
      </View>
    )
  }
  if (state.kind === 'ended') {
    return (
      <View style={styles.liveRow}>
        <View style={styles.liveDotEnded} />
        <Text style={styles.liveMeta}>Live session ended · 1 minute sampling</Text>
        <Button label="Restart live session" variant="secondary" onPress={onRestart} />
      </View>
    )
  }
  if (state.kind === 'offline') {
    return (
      <InlineNotice
        tone="warning"
        title="Server offline"
        body="Live 10-second sampling is unavailable until the host reconnects. Charts stay at 1 minute sampling."
      />
    )
  }
  return null
}

/** Fallback for a stale cache predating `topologyGenerationBreaks`. */
const EMPTY_EXPANDED_GROUPS: ReadonlySet<string> = new Set()

const EMPTY_GENERATION_BREAKS: readonly number[] = []

function MetricsCharts({
  data,
  hostGrid,
  entityGroups,
  chartDomainMs,
  expectedSamples,
  presentSamples,
  coverageLabel,
  resolutionLabel,
  twoColumn,
  rangeId,
  server,
  uptimeSeconds,
  events,
}: Readonly<{
  data: MetricsSeriesResponse
  hostGrid: NormalizedHostGrid
  entityGroups: EntityChartGroup[]
  chartDomainMs: readonly [number, number]
  expectedSamples: number
  presentSamples: number
  coverageLabel: string | null
  resolutionLabel: string
  twoColumn: boolean
  rangeId: MetricsRangeId
  server: OrgServerRecord | null
  uptimeSeconds: number | null
  events: MetricEvent[]
}>) {
  const points = hostGrid.points
  const gapBands = hostGrid.gapBands
  const xTickFormat = (ms: number) => formatAxisTime(ms, rangeId)
  // Sections start collapsed: each header now carries its own figure and mini
  // bar chart, so a closed section still answers "is this area OK?". Holding
  // the set here (rather than a `useState` inside each group) is what makes
  // the choice survive a range change.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(EMPTY_EXPANDED_GROUPS)
  const toggleGroup = useCallback((groupId: string, open: boolean) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (open) next.add(groupId)
      else next.delete(groupId)
      return next
    })
  }, [])

  const topologyGenerationBreaks = data.host?.topologyGenerationBreaks ?? EMPTY_GENERATION_BREAKS

  const breakLines = useMemo(() => {
    if (!data.host || topologyGenerationBreaks.length === 0) return undefined
    return topologyGenerationBreaks
      .map((index) => Date.parse(data.host!.points[index]?.at ?? ''))
      .filter((ms) => Number.isFinite(ms))
  }, [topologyGenerationBreaks, data.host])

  const hostCharts: RenderableChart[] = useMemo(
    () => HOST_CHART_DEFINITIONS.map((definition) => ({ definition, points })),
    [points]
  )
  const hostChartsById = useMemo(
    () => new Map(hostCharts.map((chart) => [chart.definition.id, chart])),
    [hostCharts]
  )

  const coveragePercent = expectedSamples > 0 ? (presentSamples / expectedSamples) * 100 : 0
  const gapPercent = Math.max(0, 100 - coveragePercent)

  return (
    <>
      <MetricsOverviewTiles
        hostPoints={points}
        entityGroups={entityGroups}
        inventory={data.inventory}
        server={server}
        uptimeSeconds={uptimeSeconds}
      />

      <View style={styles.coverageStrip}>
        <View style={styles.coverageHeader}>
          <Text style={styles.coverageText}>Sample coverage {coverageLabel ?? '—'}</Text>
          {(data.host?.gapCount ?? 0) > 0 ? (
            <View style={styles.gapBadge}>
              <Text style={styles.gapBadgeText}>
                {data.host?.gapCount} {data.host?.gapCount === 1 ? 'gap' : 'gaps'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.coverageBarTrack}>
          <View style={[styles.coverageBarFill, { width: `${Math.min(100, coveragePercent)}%` }]} />
          {gapPercent > 0 ? (
            <View
              style={[
                styles.coverageBarGap,
                {
                  left: `${Math.min(100, coveragePercent)}%`,
                  width: `${Math.min(100 - coveragePercent, gapPercent)}%`,
                },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.coverageMetaRow}>
          <Text style={styles.coverageMeta}>Resolution {resolutionLabel} · ~60 s cadence</Text>
          <Text style={styles.coverageMetaDim}>Amber bands = missing samples (not zero)</Text>
        </View>
      </View>

      {HOST_CHART_GROUPS.map((group) => (
        <CollapsibleChartGroup
          key={group.id}
          id={group.id}
          label={group.label}
          hint={group.hint}
          expandedGroups={expandedGroups}
          onToggle={toggleGroup}
          twoColumn={twoColumn}
          charts={group.chartIds
            .map((id) => hostChartsById.get(id))
            .filter((chart): chart is RenderableChart => chart != null)}
          chartDomainMs={chartDomainMs}
          gapBands={gapBands}
          xTickFormat={xTickFormat}
          breakLines={breakLines}
        />
      ))}

      {entityGroups.map((group) => (
        <Fragment key={group.id}>
          <CollapsibleChartGroup
            id={group.id}
            label={group.label}
            hint={group.hint}
            expandedGroups={expandedGroups}
            onToggle={toggleGroup}
            twoColumn={twoColumn}
            charts={group.charts}
            chartDomainMs={chartDomainMs}
            gapBands={gapBands}
            xTickFormat={xTickFormat}
            breakLines={breakLines}
          />
        </Fragment>
      ))}

      <MetricsEventsPanel events={events} />

      <SectionPanel title="Coverage detail" hint="Gap accounting for this range">
        <View style={styles.coverageChartMeta}>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Present</Text>
            <Text style={styles.coverageStatValue}>{presentSamples}</Text>
          </View>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Gaps</Text>
            <Text style={[styles.coverageStatValue, styles.coverageStatGap]}>
              {data.host?.gapCount ?? 0}
            </Text>
          </View>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Expected</Text>
            <Text style={styles.coverageStatValue}>{expectedSamples || '—'}</Text>
          </View>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Coverage</Text>
            <Text style={[styles.coverageStatValue, styles.coverageStatAccent]}>
              {coverageLabel ?? '—'}
            </Text>
          </View>
        </View>
      </SectionPanel>
    </>
  )
}

function resolveChartDomainMs(
  data: MetricsSeriesResponse | undefined,
  hostGrid: NormalizedHostGrid | null,
  rangeId: MetricsRangeId
): [number, number] {
  if (hostGrid && hostGrid.bucketGrid.length > 0) {
    return [hostGrid.fromMs, hostGrid.toMs]
  }
  if (data?.from && data?.to) {
    const fromMs = Date.parse(data.from)
    const toMs = Date.parse(data.to)
    if (Number.isFinite(fromMs) && Number.isFinite(toMs)) {
      return [fromMs, toMs]
    }
  }
  const bounds = computeRangeBounds(rangeId)
  return [bounds.fromMs, bounds.toMs]
}

function resolveSampleStats(
  data: MetricsSeriesResponse | undefined,
  hostGrid: NormalizedHostGrid | null
): Readonly<{
  expectedSamples: number
  presentSamples: number
  coverageLabel: string | null
}> {
  if (!data?.host) {
    return { expectedSamples: 0, presentSamples: 0, coverageLabel: null }
  }
  const expectedSamples = hostGrid?.expectedSamples ?? data.host.sampleCount + data.host.gapCount
  const presentSamples = presentSamplesFromGaps(expectedSamples, data.host.gapCount)
  const coverageLabel =
    expectedSamples > 0 ? formatCoveragePercent(presentSamples, expectedSamples) : null
  return { expectedSamples, presentSamples, coverageLabel }
}

function resolveChartsView(
  viewState: MetricsViewState,
  data: MetricsSeriesResponse | undefined,
  hostGrid: NormalizedHostGrid | null
): { data: MetricsSeriesResponse; hostGrid: NormalizedHostGrid } | null {
  if (viewState !== 'charts' || !data || !hostGrid) {
    return null
  }
  return { data, hostGrid }
}

function MetricsRefreshingBanner({
  isFetching,
  hasData,
}: Readonly<{ isFetching: boolean; hasData: boolean }>) {
  if (!isFetching || !hasData) {
    return null
  }
  return (
    <View style={styles.refetchBanner}>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={panelStyles.muted}>Refreshing charts…</Text>
    </View>
  )
}

function MetricsOfflineBanner({
  stale,
  showingCharts,
}: Readonly<{ stale: boolean; showingCharts: boolean }>) {
  if (!stale || !showingCharts) {
    return null
  }
  return (
    <View style={styles.offlineBanner}>
      <View style={styles.offlineBannerDot} />
      <View style={styles.offlineBannerCopy}>
        <Text style={styles.offlineBannerTitle}>Server offline</Text>
        <Text style={styles.offlineBannerText}>
          Charts may show stale data until the host reconnects.
        </Text>
      </View>
    </View>
  )
}

function MetricsPageHeader({
  embedded,
  server,
}: Readonly<{ embedded: boolean; server: OrgServerRecord | null }>) {
  if (embedded) {
    return null
  }
  const title = server ? serverTitle(server) : 'Server'
  return (
    <>
      <Text style={panelStyles.pageTitle}>{title} · Metrics</Text>
      <Text style={panelStyles.pageCopy}>
        Host metrics sampled about once per minute. The 5m and 10m ranges switch to 10-second live
        sampling while this page is open.
      </Text>
    </>
  )
}

export function ServerMetricsSection({
  orgId,
  serverId,
  embedded = false,
}: Readonly<{ orgId: string; serverId: string; embedded?: boolean }>) {
  const { width } = useWindowDimensions()
  const [rangeId, setRangeId] = useState<MetricsRangeId>('1h')
  const timing = rangeQueryTiming(rangeId)
  const twoColumn = width >= layout.desktopBreakpoint

  const serversQuery = useOrgServers(orgId)
  const updateStatusQuery = useServerUpdateStatus(orgId, serverId)
  const triggerUpdateMutation = useTriggerServerUpdate(orgId, serverId)
  const canManage = useCan('organization', orgId, 'organization:manage')

  const liveEligible = isLiveRange(rangeId)
  const live = useLiveMetricsSession(orgId, serverId, liveEligible, rangeId)
  const liveActive = live.state.kind === 'live'
  const queryTiming = liveAwareQueryTiming(liveActive, timing)

  const server = serversQuery.data?.servers.find((row) => row.id === serverId) ?? null

  const metricsQuery = useServerMetricsSeries(
    orgId,
    serverId,
    () => {
      const bounds = computeRangeBounds(rangeId)
      return { fromIso: bounds.fromIso, toIso: bounds.toIso, metrics: HOST_METRIC_IDS }
    },
    {
      refetchInterval: queryTiming.refetchInterval,
      staleTime: queryTiming.staleTime,
      rangeKey: rangeId,
    }
  )

  const data = metricsQuery.data
  const inventory = data?.inventory ?? null
  const topologyGeneration = data?.topologyGeneration ?? null
  const entityMetricBatches = useMemo(
    () => buildEntityMetricPlan(inventory),
    [inventory]
  )

  const entityQueries = useServerMetricsSeriesBatches(
    orgId,
    serverId,
    entityMetricBatches,
    () => {
      const bounds = computeRangeBounds(rangeId)
      return { fromIso: bounds.fromIso, toIso: bounds.toIso }
    },
    {
      enabled: entityMetricBatches.length > 0,
      refetchInterval: queryTiming.refetchInterval,
      staleTime: queryTiming.staleTime,
      rangeKey: `${rangeId}:${topologyGeneration ?? 'none'}`,
    }
  )
  const entityResults = useMemo(
    () => mergeEntityBatchResults(entityQueries.map((query) => query.data)),
    [entityQueries]
  )

  const rangeBoundsForAux = computeRangeBounds(rangeId)
  const eventsQuery = useServerMetricsEvents(
    orgId,
    serverId,
    { fromIso: rangeBoundsForAux.fromIso, toIso: rangeBoundsForAux.toIso },
    { refetchInterval: timing.refetchInterval, rangeKey: rangeId }
  )
  const connectionQuery = useServerMetricsConnection(
    orgId,
    serverId,
    { fromIso: rangeBoundsForAux.fromIso, toIso: rangeBoundsForAux.toIso },
    { refetchInterval: timing.refetchInterval, rangeKey: rangeId }
  )

  const viewState = resolveViewState(server, data, metricsQuery.error)
  const stale = isServerStale(server)
  const updateAvailable = updateStatusQuery.data?.updateAvailable === true
  const updating = triggerUpdateMutation.isPending || updateStatusQuery.data?.status === 'updating'

  const hostGrid = useMemo(() => (data ? normalizeHostGrid(data) : null), [data])

  const temperatureUnit: TemperatureUnit = data?.temperatureUnit ?? 'celsius'
  const entityGroups = useMemo(
    () =>
      hostGrid
        ? buildEntityChartGroups(
            inventory,
            entityResults,
            hostGrid.bucketGrid,
            temperatureUnit,
            data?.resolutionSeconds ?? 60
          )
        : [],
    [inventory, entityResults, hostGrid, temperatureUnit, data?.resolutionSeconds]
  )

  const chartDomainMs = useMemo(
    () => resolveChartDomainMs(data, hostGrid, rangeId),
    [data, hostGrid, rangeId]
  )

  const { expectedSamples, presentSamples, coverageLabel } = resolveSampleStats(data, hostGrid)
  const chartsView = resolveChartsView(viewState, data, hostGrid)
  const resolutionLabel = metricsResolutionLabel(data?.resolutionSeconds)

  const handleRetry = () => {
    metricsQuery.refetch().catch(() => {
      // Errors surface via React Query state.
    })
  }

  return (
    <View style={styles.root}>
      <MetricsPageHeader embedded={embedded} server={server} />

      <SectionPanel title="Time range" hint="Auto-refresh on shorter ranges" accent>
        <RangePicker rangeId={rangeId} onChange={setRangeId} />
        {liveEligible ? <LiveModeIndicator state={live.state} onRestart={live.restart} /> : null}
      </SectionPanel>

      <MetricsRefreshingBanner isFetching={metricsQuery.isFetching} hasData={data != null} />
      <MetricsOfflineBanner stale={stale} showingCharts={viewState === 'charts'} />

      <MetricsStatusMessages
        viewState={viewState}
        backend={data?.backend ?? 'disabled'}
        isLoading={metricsQuery.isLoading}
        hasData={data != null}
        queryError={metricsQuery.error}
        onRetry={handleRetry}
        updateAvailable={updateAvailable}
        updating={updating}
        canUpdate={canManage && server?.connected === true}
        updateBusy={triggerUpdateMutation.isPending}
        onUpdate={() => {
          triggerUpdateMutation.mutate()
        }}
      />

      {chartsView ? (
        <MetricsCharts
          data={chartsView.data}
          hostGrid={chartsView.hostGrid}
          entityGroups={entityGroups}
          chartDomainMs={chartDomainMs}
          expectedSamples={expectedSamples}
          presentSamples={presentSamples}
          coverageLabel={coverageLabel}
          resolutionLabel={resolutionLabel}
          twoColumn={twoColumn}
          rangeId={rangeId}
          server={server}
          uptimeSeconds={connectionQuery.data?.uptimeSeconds ?? null}
          events={eventsQuery.data?.events ?? []}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  rangeRow: {
    gap: spacing.sm,
  },
  rangeLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rangeHint: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 15,
  },
  rangeChipPressed: {
    opacity: 0.88,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  refetchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    alignSelf: 'flex-start',
  },
  stateBlock: {
    borderLeftWidth: 3,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.pending,
  },
  offlineBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pending,
    marginTop: 4,
  },
  offlineBannerCopy: {
    flex: 1,
    gap: 2,
  },
  offlineBannerTitle: {
    color: colors.pending,
    fontSize: 13,
    fontWeight: '700',
  },
  offlineBannerText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  hardwareCaption: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  coverageStrip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: chrome.accent,
  },
  coverageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  coverageText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  gapBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gapBadgeText: {
    color: colors.pending,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  coverageBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
    position: 'relative',
  },
  coverageBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: chrome.accent,
  },
  coverageBarGap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(224, 179, 65, 0.45)',
  },
  coverageMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  coverageMeta: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  coverageMetaDim: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 15,
  },
  chartGroup: {
    gap: spacing.sm,
  },
  chartGroupNote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 15,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveDotEnded: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textFaint,
  },
  liveText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  liveMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chartGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgAreaHeader,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chartGroupHeaderExpanded: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgActive,
  },
  chartGroupChevron: {
    color: colors.textDim,
    fontSize: 12,
    width: 12,
  },
  chartGroupChevronOpen: {
    color: colors.accent,
  },
  chartGroupCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  chartGroupTitle: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  chartGroupHint: {
    color: colors.textDim,
    fontSize: 12,
  },
  chartGroupCount: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    minWidth: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chartGroupCountActive: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgPanel,
  },
  chartGroupCountText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  chartGroupCountTextActive: {
    color: chrome.accent,
  },
  /** Collapsed-section summary: headline figure, mini bar chart, state chip. */
  groupSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupSummaryFigure: {
    color: colors.textTitle,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  summaryBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 20,
    width: 56,
  },
  summaryBar: {
    flex: 1,
    borderRadius: 1,
    minHeight: 1,
  },
  summaryBarGap: {
    height: '100%',
    backgroundColor: colors.border,
    opacity: 0.35,
  },
  groupSummaryChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: colors.bgSecondary,
  },
  groupSummaryChipCritical: {
    backgroundColor: colors.errorSoft,
  },
  groupSummaryChipText: {
    color: colors.textTitle,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chartGrid: {
    gap: spacing.lg,
  },
  chartGridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coverageChartMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  coverageStat: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  coverageStatLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  coverageStatValue: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  coverageStatGap: {
    color: colors.pending,
  },
  coverageStatAccent: {
    color: chrome.accent,
  },
  eventsList: {
    gap: spacing.sm,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  eventCopy: {
    flex: 1,
    gap: 1,
  },
  eventKind: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  eventMeta: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
})
