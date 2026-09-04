import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
  NetworkMetricIcon,
  ProcessMetricIcon,
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
import { formatCoresTotal, serverInventoryCpuCores } from '@/lib/fleet-capacity'
import {
  derivedCpuBusyPercent,
  formatAxisTime,
  formatBytes,
  formatBytesPerSecond,
  formatCelsiusAs,
  formatCount,
  formatCoveragePercent,
  formatMilliseconds,
  formatOpsPerSecond,
  formatPercent,
  formatUptimeSeconds,
  formatWatts,
  presentSamplesFromGaps,
  type MetricsRangeId,
  type TemperatureUnit,
} from '@/lib/format-metrics'
import {
  MetricsBackendUnavailableError,
  type EffectiveCpuThermalLimits,
  type HostMetricDerivedValues,
  type MetricsBackendKind,
  type HostMetricKey,
  type MetricsLiveStartOutcome,
  type OrgServerRecord,
  type MetricsSeriesPoint,
  type MetricsSeriesResponse,
  type ServerHardwareProfile,
} from '@/lib/instance-api'
import {
  HA_METRICS_LOCAL_NOTE,
  TURBOFABRIC_PRODUCT_NAME,
} from '@/lib/platform-copy'
import { useCan } from '@/lib/query-client'
import {
  useOrgServers,
  useServerDetail,
  useServerMetricsSeries,
  useServerUpdateStatus,
  useStartServerMetricsLive,
  useStopServerMetricsLive,
  useTriggerServerUpdate,
} from '@/lib/queries/servers'
import {
  CPU_IOWAIT,
  CPU_OTHER,
  CPU_SYSTEM,
  CPU_USER,
  LOAD_FILL,
  memoryUsedPercentFrom,
  usedPercentFromBytes,
} from '@/lib/server-usage'
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
  CPU_OTHER,
  CPU_IOWAIT,
  LOAD_FILL,
] as const

type PointValueReader = (point: MetricsSeriesPoint) => number | null

/** Read one stored metric; missing/non-finite → null (never 0). */
function metric(key: HostMetricKey): PointValueReader {
  return (point) => {
    const value = point.values[key]
    if (value == null || !Number.isFinite(value)) return null
    return value
  }
}

/** Read one server-computed `derived.*` value; missing/non-finite → null. */
function derived(key: keyof HostMetricDerivedValues): PointValueReader {
  return (point) => {
    const value = point.derived?.[key]
    if (value == null || !Number.isFinite(value)) return null
    return value
  }
}

/** Derived used % from a stored total/free byte pair. */
function usedPercent(
  totalKey: HostMetricKey,
  freeKey: HostMetricKey,
): PointValueReader {
  return (point) =>
    usedPercentFromBytes(point.values[totalKey] ?? null, point.values[freeKey] ?? null)
}

const readCpuBusy: PointValueReader = (point) =>
  derivedCpuBusyPercent(point.values.cpuIdlePercent ?? null)

/** Share of requests served under 100ms — client-computed, guards ÷0. */
const readFastRequestPercent: PointValueReader = (point) => {
  const under100 = point.values.caddyRequestsUnder100msTotal
  const total = point.values.caddyRequestsTotal
  if (
    under100 == null ||
    total == null ||
    !Number.isFinite(under100) ||
    !Number.isFinite(total) ||
    total === 0
  ) {
    return null
  }
  return (under100 / total) * 100
}

type ChartSeriesDefinition = Readonly<{
  id: string
  label: string
  read: PointValueReader
  /** Explicit series color; falls back to the shared palette by position. */
  color?: string
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
  /** Render series as a cumulative stacked area chart (CPU modes). */
  stacked?: boolean
  /**
   * Omit the whole card when no series has a non-null sample in the range —
   * a missing sensor/mount must never paint a 0-value flatline.
   */
  hideWhenEmpty?: boolean
  /** Dashed horizontal limit line (Tjmax/TDP) — raw units, matching the plotted series. */
  referenceLine?: ChartReferenceLine
  /** Muted caption under the legend — e.g. a headroom-to-limit readout. */
  computeCaption?: (points: MetricsSeriesPoint[]) => string | null
}>

const CHART_DEFINITIONS: readonly ChartDefinition[] = [
  {
    id: 'cpu',
    title: 'CPU utilization',
    unit: '%',
    // Stacked bottom-up in this order. Idle is deliberately excluded — it's
    // headroom, not usage, and including it would flatten the busy bands
    // against a mostly-idle y-axis instead of zooming in on real load.
    stacked: true,
    series: [
      {
        id: 'cpuUserPercent',
        label: 'User',
        color: CPU_USER,
        read: metric('cpuUserPercent'),
      },
      {
        id: 'cpuSystemPercent',
        label: 'System',
        color: CPU_SYSTEM,
        read: metric('cpuSystemPercent'),
      },
      {
        id: 'cpuNicePercent',
        label: 'Nice',
        color: CPU_OTHER,
        read: metric('cpuNicePercent'),
      },
      {
        id: 'cpuIowaitPercent',
        label: 'I/O wait',
        color: CPU_IOWAIT,
        read: metric('cpuIowaitPercent'),
      },
      {
        id: 'cpuIrqPercent',
        label: 'IRQ',
        color: colors.errorSoft,
        read: metric('cpuIrqPercent'),
      },
      {
        id: 'cpuSoftirqPercent',
        label: 'SoftIRQ',
        color: colors.pending,
        read: metric('cpuSoftirqPercent'),
      },
      {
        id: 'cpuStealPercent',
        label: 'Steal',
        color: colors.log,
        read: metric('cpuStealPercent'),
      },
    ],
    // No fixed 0–100 domain: the axis auto-scales to whatever's actually
    // plotted, so a mostly-idle host zooms in on its real (small) usage
    // instead of compressing it against 100% of mostly-unused headroom.
    yFormat: (v) => formatPercent(v),
  },
  {
    id: 'load',
    title: 'Load average',
    unit: 'load',
    series: [
      { id: 'load1', label: '1m', read: metric('load1') },
      { id: 'load5', label: '5m', read: metric('load5') },
      { id: 'load15', label: '15m', read: metric('load15') },
    ],
    yFormat: (v) => v.toFixed(2),
  },
  {
    id: 'memory-bytes',
    title: 'Memory bytes',
    unit: 'bytes',
    series: [
      { id: 'memoryTotalBytes', label: 'Total', read: metric('memoryTotalBytes') },
      {
        id: 'memoryAvailableBytes',
        label: 'Available',
        read: metric('memoryAvailableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'memory-percent',
    title: 'Memory used',
    unit: '%',
    series: [
      {
        id: 'memoryUsed',
        label: 'Used',
        read: usedPercent('memoryTotalBytes', 'memoryAvailableBytes'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'swap-bytes',
    title: 'Swap bytes',
    unit: 'bytes',
    series: [
      { id: 'swapTotalBytes', label: 'Total', read: metric('swapTotalBytes') },
      { id: 'swapFreeBytes', label: 'Free', read: metric('swapFreeBytes') },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'swap-percent',
    title: 'Swap used',
    unit: '%',
    series: [
      {
        id: 'swapUsed',
        label: 'Used',
        read: usedPercent('swapTotalBytes', 'swapFreeBytes'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'storage-system',
    title: 'System storage',
    unit: 'bytes',
    series: [
      {
        id: 'systemStorageTotalBytes',
        label: 'Total',
        read: metric('systemStorageTotalBytes'),
      },
      {
        id: 'systemStorageAvailableBytes',
        label: 'Available',
        read: metric('systemStorageAvailableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'storage-hosting',
    title: 'Hosting storage',
    unit: 'bytes',
    series: [
      {
        id: 'hostingStorageTotalBytes',
        label: 'Total',
        read: metric('hostingStorageTotalBytes'),
      },
      {
        id: 'hostingStorageAvailableBytes',
        label: 'Available',
        read: metric('hostingStorageAvailableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'storage-docker',
    title: 'Docker storage',
    unit: 'bytes',
    series: [
      {
        id: 'dockerStorageTotalBytes',
        label: 'Total',
        read: metric('dockerStorageTotalBytes'),
      },
      {
        id: 'dockerStorageAvailableBytes',
        label: 'Available',
        read: metric('dockerStorageAvailableBytes'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'disk-throughput',
    title: 'Disk throughput',
    unit: 'B/s',
    series: [
      {
        id: 'diskReadBytesPerSecond',
        label: 'Read',
        read: metric('diskReadBytesPerSecond'),
      },
      {
        id: 'diskWriteBytesPerSecond',
        label: 'Write',
        read: metric('diskWriteBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    id: 'disk-ops',
    title: 'Disk operations',
    unit: 'ops/s',
    series: [
      {
        id: 'diskReadOpsPerSecond',
        label: 'Read',
        read: metric('diskReadOpsPerSecond'),
      },
      {
        id: 'diskWriteOpsPerSecond',
        label: 'Write',
        read: metric('diskWriteOpsPerSecond'),
      },
    ],
    yFormat: (v) => formatOpsPerSecond(v),
  },
  {
    id: 'disk-latency',
    title: 'Disk latency',
    unit: 'ms',
    series: [
      {
        id: 'diskReadLatencyMs',
        label: 'Read',
        read: metric('diskReadLatencyMs'),
      },
      {
        id: 'diskWriteLatencyMs',
        label: 'Write',
        read: metric('diskWriteLatencyMs'),
      },
    ],
    yFormat: (v) => formatMilliseconds(v),
  },
  {
    // Title kept generic — this is one measured interface among several
    // (see `network-nic1`/`network-nic2`), not necessarily "the" uplink.
    id: 'network-uplink',
    title: 'Primary interface',
    unit: 'B/s',
    series: [
      {
        id: 'interfaceReceiveBytesPerSecond',
        label: 'Receive',
        read: metric('interfaceReceiveBytesPerSecond'),
      },
      {
        id: 'interfaceTransmitBytesPerSecond',
        label: 'Transmit',
        read: metric('interfaceTransmitBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    // Title resolved per-render from `server.hardwareProfile.nic1`.
    id: 'network-nic1',
    title: 'NIC 1',
    unit: 'B/s',
    series: [
      {
        id: 'nic1ReceiveBytesPerSecond',
        label: 'Receive',
        read: metric('nic1ReceiveBytesPerSecond'),
      },
      {
        id: 'nic1TransmitBytesPerSecond',
        label: 'Transmit',
        read: metric('nic1TransmitBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
    hideWhenEmpty: true,
  },
  {
    // Title resolved per-render from `server.hardwareProfile.nic2`.
    id: 'network-nic2',
    title: 'NIC 2',
    unit: 'B/s',
    series: [
      {
        id: 'nic2ReceiveBytesPerSecond',
        label: 'Receive',
        read: metric('nic2ReceiveBytesPerSecond'),
      },
      {
        id: 'nic2TransmitBytesPerSecond',
        label: 'Transmit',
        read: metric('nic2TransmitBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
    hideWhenEmpty: true,
  },
  {
    id: 'network-fabric',
    title: TURBOFABRIC_PRODUCT_NAME,
    unit: 'B/s',
    series: [
      {
        id: 'fabricReceiveBytesPerSecond',
        label: 'Receive',
        read: metric('fabricReceiveBytesPerSecond'),
      },
      {
        id: 'fabricTransmitBytesPerSecond',
        label: 'Transmit',
        read: metric('fabricTransmitBytesPerSecond'),
      },
    ],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    // yFormat/referenceLine/computeCaption resolved per-render from
    // `data.temperatureUnit` and `data.cpuLimits`.
    id: 'temperature',
    title: 'Temperatures',
    unit: '°C',
    series: [
      {
        id: 'cpuTemperatureCelsius',
        label: 'CPU',
        read: metric('cpuTemperatureCelsius'),
      },
      {
        id: 'gpuTemperatureCelsius',
        label: 'GPU',
        read: metric('gpuTemperatureCelsius'),
      },
    ],
    yFormat: (v) => formatCelsiusAs(v, 'celsius'),
    hideWhenEmpty: true,
  },
  {
    // referenceLine/computeCaption resolved per-render from `data.cpuLimits`.
    id: 'power',
    title: 'Power draw',
    unit: 'W',
    series: [
      { id: 'cpuPowerWatts', label: 'CPU', read: metric('cpuPowerWatts') },
      { id: 'gpuPowerWatts', label: 'GPU', read: metric('gpuPowerWatts') },
    ],
    yFormat: (v) => formatWatts(v),
    hideWhenEmpty: true,
  },
  {
    id: 'gpu-utilization',
    title: 'GPU utilization',
    unit: '%',
    series: [
      {
        id: 'gpuUtilizationPercent',
        label: 'GPU',
        read: metric('gpuUtilizationPercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    hideWhenEmpty: true,
  },
  {
    id: 'fan-speeds',
    title: 'Fan speeds',
    unit: 'RPM',
    series: [
      { id: 'cpuFanRpm', label: 'CPU', read: metric('cpuFanRpm') },
      { id: 'gpuFanRpm', label: 'GPU', read: metric('gpuFanRpm') },
      {
        id: 'systemFan1Rpm',
        label: 'System 1',
        read: metric('systemFan1Rpm'),
      },
      {
        id: 'systemFan2Rpm',
        label: 'System 2',
        read: metric('systemFan2Rpm'),
      },
    ],
    yFormat: (v) => `${formatCount(v)} RPM`,
    hideWhenEmpty: true,
  },
  {
    // Series labels resolved per-render from `server.hardwareProfile.disk1Temperature`/`disk2Temperature`.
    id: 'disk-temperatures',
    title: 'Disk temperatures',
    unit: '°C',
    series: [
      {
        id: 'disk1TemperatureCelsius',
        label: 'Disk 1',
        read: metric('disk1TemperatureCelsius'),
      },
      {
        id: 'disk2TemperatureCelsius',
        label: 'Disk 2',
        read: metric('disk2TemperatureCelsius'),
      },
    ],
    yFormat: (v) => formatCelsiusAs(v, 'celsius'),
    hideWhenEmpty: true,
  },
  {
    id: 'ambient-board-temperatures',
    title: 'Ambient & board temperatures',
    unit: '°C',
    series: [
      {
        id: 'ambient1TemperatureCelsius',
        label: 'Ambient 1',
        read: metric('ambient1TemperatureCelsius'),
      },
      {
        id: 'ambient2TemperatureCelsius',
        label: 'Ambient 2',
        read: metric('ambient2TemperatureCelsius'),
      },
      {
        id: 'boardTemperatureCelsius',
        label: 'Board',
        read: metric('boardTemperatureCelsius'),
      },
    ],
    yFormat: (v) => formatCelsiusAs(v, 'celsius'),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-requests',
    title: 'Requests',
    unit: 'req',
    series: [
      {
        id: 'caddyRequestsTotal',
        label: 'Requests',
        read: metric('caddyRequestsTotal'),
      },
    ],
    yFormat: (v) => formatCount(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-status-classes',
    title: 'Response status classes',
    unit: 'req',
    stacked: true,
    series: [
      {
        id: 'caddyResponses2xxTotal',
        label: '2xx',
        color: colors.green,
        read: metric('caddyResponses2xxTotal'),
      },
      {
        id: 'caddyResponses3xxTotal',
        label: '3xx',
        color: colors.command,
        read: metric('caddyResponses3xxTotal'),
      },
      {
        id: 'caddyResponses4xxTotal',
        label: '4xx',
        color: colors.pending,
        read: metric('caddyResponses4xxTotal'),
      },
      {
        id: 'caddyResponses5xxTotal',
        label: '5xx',
        color: colors.errorSoft,
        read: metric('caddyResponses5xxTotal'),
      },
    ],
    yFormat: (v) => formatCount(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-error-rate',
    title: 'HTTP error rate',
    unit: '%',
    series: [
      {
        id: 'httpErrorRatePercent',
        label: 'Errors',
        read: derived('httpErrorRatePercent'),
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
    hideWhenEmpty: true,
  },
  {
    // Per-interval sums, not a rate — labelled accordingly.
    id: 'traffic-bandwidth',
    title: 'Request/response bytes',
    unit: 'bytes',
    series: [
      {
        id: 'caddyRequestBytesTotal',
        label: 'Request',
        read: metric('caddyRequestBytesTotal'),
      },
      {
        id: 'caddyResponseBytesTotal',
        label: 'Response',
        read: metric('caddyResponseBytesTotal'),
      },
    ],
    yFormat: (v) => formatBytes(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-latency',
    title: 'HTTP latency',
    unit: 'ms',
    series: [
      {
        id: 'httpAverageLatencyMs',
        label: 'Avg latency',
        read: derived('httpAverageLatencyMs'),
      },
    ],
    yFormat: (v) => formatMilliseconds(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-fast-request-rate',
    title: 'Requests under 100ms',
    unit: '%',
    series: [
      {
        id: 'fastRequestPercent',
        label: 'Under 100ms',
        read: readFastRequestPercent,
      },
    ],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-concurrency',
    title: 'Requests in flight',
    unit: 'count',
    series: [
      {
        id: 'caddyRequestsInFlight',
        label: 'In flight',
        read: metric('caddyRequestsInFlight'),
      },
    ],
    yFormat: (v) => formatCount(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-proxysql-queries',
    title: 'ProxySQL queries',
    unit: 'queries',
    series: [
      {
        id: 'proxysqlQueriesTotal',
        label: 'Queries',
        read: metric('proxysqlQueriesTotal'),
      },
      {
        id: 'proxysqlSlowQueriesTotal',
        label: 'Slow queries',
        color: colors.pending,
        read: metric('proxysqlSlowQueriesTotal'),
      },
    ],
    yFormat: (v) => formatCount(v),
    hideWhenEmpty: true,
  },
  {
    id: 'traffic-proxysql-connections',
    title: 'ProxySQL connections',
    unit: 'count',
    series: [
      {
        id: 'proxysqlClientConnections',
        label: 'Client',
        read: metric('proxysqlClientConnections'),
      },
      {
        id: 'proxysqlBackendConnections',
        label: 'Backend',
        read: metric('proxysqlBackendConnections'),
      },
      {
        id: 'proxysqlBackendsUp',
        label: 'Backends up',
        color: colors.green,
        read: metric('proxysqlBackendsUp'),
      },
    ],
    yFormat: (v) => formatCount(v),
    hideWhenEmpty: true,
  },
  {
    id: 'processes',
    title: 'Process count',
    unit: 'count',
    series: [
      { id: 'processCount', label: 'Processes', read: metric('processCount') },
    ],
    yFormat: (v) => formatCount(v),
  },
  {
    id: 'uptime',
    title: 'Uptime',
    unit: 'duration',
    series: [
      { id: 'uptimeSeconds', label: 'Uptime', read: metric('uptimeSeconds') },
    ],
    yFormat: (v) => formatUptimeSeconds(v),
  },
]

type ChartGroupDefinition = Readonly<{
  id: string
  label: string
  hint: string
  chartIds: readonly string[]
  /** Muted caveat shown above the charts while expanded. */
  note?: string
}>

const CHART_GROUPS: readonly ChartGroupDefinition[] = [
  {
    id: 'cpu',
    label: 'CPU',
    hint: 'CPU modes and load average',
    chartIds: ['cpu', 'load'],
  },
  {
    id: 'memory',
    label: 'Memory',
    hint: 'RAM and swap capacity and utilization',
    chartIds: ['memory-bytes', 'memory-percent', 'swap-bytes', 'swap-percent'],
  },
  {
    id: 'storage',
    label: 'Storage',
    hint: 'Capacity, throughput, I/O ops, and latency',
    chartIds: [
      'storage-system',
      'storage-hosting',
      'storage-docker',
      'disk-throughput',
      'disk-ops',
      'disk-latency',
    ],
  },
  {
    id: 'network',
    label: 'Network',
    hint: `Primary interface, NIC taps, and ${TURBOFABRIC_PRODUCT_NAME} throughput`,
    chartIds: ['network-uplink', 'network-nic1', 'network-nic2', 'network-fabric'],
    note: `The primary interface, NIC 1, and NIC 2 charts are measured on the host's network interfaces and may overlap — NIC 1/2 are taps of the same traffic the primary-interface chart aggregates, not additional throughput. ${TURBOFABRIC_PRODUCT_NAME} is a separate interface entirely; none of these are additive.`,
  },
  {
    id: 'hardware',
    label: 'Hardware',
    hint: 'Temperatures, power draw, and fan speeds — shown only when sensors report',
    chartIds: [
      'temperature',
      'power',
      'gpu-utilization',
      'fan-speeds',
      'disk-temperatures',
      'ambient-board-temperatures',
    ],
  },
  {
    id: 'traffic',
    label: 'Traffic',
    hint: 'HTTP (Caddy) and database-proxy (ProxySQL) traffic — shown only for sources that reported',
    chartIds: [
      'traffic-requests',
      'traffic-status-classes',
      'traffic-error-rate',
      'traffic-bandwidth',
      'traffic-latency',
      'traffic-fast-request-rate',
      'traffic-concurrency',
      'traffic-proxysql-queries',
      'traffic-proxysql-connections',
    ],
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Process count and uptime',
    chartIds: ['processes', 'uptime'],
  },
]

/** Latest reading for a `derived.*` key across the visible points, or null. */
function latestDerivedValue(
  points: MetricsSeriesPoint[],
  key: keyof HostMetricDerivedValues,
): number | null {
  return latestReadValue(points, derived(key))
}

/** "12% headroom to Tjmax" style caption — omitted when no sample has a headroom reading. */
function headroomCaption(
  key: keyof HostMetricDerivedValues,
  limitLabel: string,
): (points: MetricsSeriesPoint[]) => string | null {
  return (points) => {
    const value = latestDerivedValue(points, key)
    if (value == null) return null
    return `${formatPercent(value)} headroom to ${limitLabel}`
  }
}

/**
 * Resolves the handful of chart definitions whose title, y-format, or
 * reference line depend on per-render data (hardware-profile labels, the
 * organization's temperature unit, resolved CPU thermal/power limits) —
 * everything else in `CHART_DEFINITIONS` passes through unchanged. Collapsing
 * these into one map keeps title/format/reference-line resolution on a single
 * path instead of three separate ones.
 */
function resolveChartDefinitions(
  hardwareProfile: ServerHardwareProfile | null | undefined,
  temperatureUnit: TemperatureUnit,
  cpuLimits: EffectiveCpuThermalLimits,
): Map<string, ChartDefinition> {
  const celsiusFormat = (value: number) => formatCelsiusAs(value, temperatureUnit)
  const temperatureDisplayUnit = temperatureUnit === 'fahrenheit' ? '°F' : '°C'

  const overrides: Partial<Record<string, (definition: ChartDefinition) => ChartDefinition>> = {
    'network-nic1': (definition) => ({
      ...definition,
      title: hardwareProfile?.nic1?.trim() || 'NIC 1',
    }),
    'network-nic2': (definition) => ({
      ...definition,
      title: hardwareProfile?.nic2?.trim() || 'NIC 2',
    }),
    'disk-temperatures': (definition) => ({
      ...definition,
      unit: temperatureDisplayUnit,
      yFormat: celsiusFormat,
      series: definition.series.map((entry, index) => ({
        ...entry,
        label:
          index === 0
            ? hardwareProfile?.disk1Temperature?.chip?.trim() || 'Disk 1'
            : hardwareProfile?.disk2Temperature?.chip?.trim() || 'Disk 2',
      })),
    }),
    'ambient-board-temperatures': (definition) => ({
      ...definition,
      unit: temperatureDisplayUnit,
      yFormat: celsiusFormat,
    }),
    temperature: (definition) => ({
      ...definition,
      unit: temperatureDisplayUnit,
      yFormat: celsiusFormat,
      referenceLine:
        cpuLimits.tjMaxCelsius != null
          ? { value: cpuLimits.tjMaxCelsius, label: `Tjmax ${celsiusFormat(cpuLimits.tjMaxCelsius)}` }
          : undefined,
      computeCaption:
        cpuLimits.source !== 'none'
          ? headroomCaption('cpuThermalHeadroomPercent', 'Tjmax')
          : undefined,
    }),
    power: (definition) => ({
      ...definition,
      referenceLine:
        cpuLimits.tdpWatts != null
          ? { value: cpuLimits.tdpWatts, label: `TDP ${formatWatts(cpuLimits.tdpWatts)}` }
          : undefined,
      computeCaption:
        cpuLimits.source !== 'none'
          ? headroomCaption('cpuPowerHeadroomPercent', 'TDP')
          : undefined,
    }),
  }

  return new Map(
    CHART_DEFINITIONS.map((definition) => [
      definition.id,
      overrides[definition.id]?.(definition) ?? definition,
    ]),
  )
}

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

/**
 * Baseline (non-live) refetch cadence. Live ranges fall back to this when the
 * lease is denied, expired, or the server is offline.
 */
function rangeQueryTiming(rangeId: MetricsRangeId): {
  refetchInterval: number | false
  staleTime: number
} {
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
  // Presence is authoritative from Postgres `server.connected` (maintained by
  // connect/disconnect + the offline sweep), the same signal the servers
  // overview uses. Live cell inbound markers are admin-snapshot-only and are
  // not a sub-few-minutes freshness signal on this path.
  return !server.connected
}

function bucketFloor(ms: number, resolutionSeconds: number): number {
  const bucketMs = resolutionSeconds * 1000
  return Math.floor(ms / bucketMs) * bucketMs
}

function defaultExpectedSamplesPerBucket(resolutionSeconds: number): number {
  return Math.max(1, Math.round(resolutionSeconds / 60))
}

function normalizeMetricsGrid(data: MetricsSeriesResponse): {
  points: MetricsSeriesPoint[]
  gapBands: MetricGapBand[]
  expectedSamples: number
  fromMs: number
  toMs: number
} {
  const fromMs = Date.parse(data.from)
  const toMs = Date.parse(data.to)
  const resolutionSeconds = data.resolutionSeconds

  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    !resolutionSeconds ||
    resolutionSeconds <= 0
  ) {
    return {
      points: data.points,
      gapBands: [],
      expectedSamples: data.sampleCount + data.gapCount,
      fromMs: Number.isFinite(fromMs) ? fromMs : 0,
      toMs: Number.isFinite(toMs) ? toMs : 0,
    }
  }

  const bucketMs = resolutionSeconds * 1000
  const startMs = bucketFloor(fromMs, resolutionSeconds)
  // Half-open [from, to) on bucket starts — same as instance computeSeriesGapCount.
  // Inclusive end always expects the in-progress `to` bucket (1 h @ 60 s → 61).
  const endMs = bucketFloor(toMs, resolutionSeconds)
  const defaultExpected = defaultExpectedSamplesPerBucket(resolutionSeconds)

  const pointByBucket = new Map<number, MetricsSeriesPoint>()
  for (const point of data.points) {
    const atMs = Date.parse(point.at)
    if (Number.isNaN(atMs)) continue
    pointByBucket.set(bucketFloor(atMs, resolutionSeconds), point)
  }

  const points: MetricsSeriesPoint[] = []
  const gapBands: MetricGapBand[] = []
  let expectedSamples = 0

  for (let bucket = startMs; bucket < endMs; bucket += bucketMs) {
    const existing = pointByBucket.get(bucket)
    const band = { fromMs: bucket, toMs: bucket + bucketMs }

    if (!existing) {
      expectedSamples += defaultExpected
      gapBands.push(band)
      points.push({
        at: new Date(bucket).toISOString(),
        values: {},
        sampleCount: 0,
        expectedSampleCount: defaultExpected,
      })
      continue
    }

    const expected = existing.expectedSampleCount ?? defaultExpected
    expectedSamples += expected
    if (existing.sampleCount < expected) {
      gapBands.push(band)
    }
    points.push(existing)
  }

  return {
    points,
    gapBands,
    expectedSamples,
    fromMs: startMs,
    toMs: endMs,
  }
}

/**
 * Builds each series' plotted points, nulling out the sample at a
 * hardware-profile generation boundary — the vertical divider alone only
 * decorates the transition, so every affected series must also gap here to
 * stop two different physical sensors from reading as one continuous trend.
 */
function buildChartSeries(
  points: MetricsSeriesPoint[],
  definition: ChartDefinition,
  breakMs?: ReadonlySet<number>,
): MetricLineSeries[] {
  return definition.series.map((entry, index) => ({
    key: entry.id,
    label: entry.label,
    color: entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length]!,
    points: points.map((point) => {
      const tMs = Date.parse(point.at)
      return {
        tMs,
        value: breakMs?.has(tMs) ? null : entry.read(point),
      }
    }),
  }))
}

/** True when any series in the chart has at least one non-null sample. */
function chartHasAnyData(
  points: MetricsSeriesPoint[],
  definition: ChartDefinition,
): boolean {
  return definition.series.some((entry) =>
    points.some((point) => entry.read(point) != null),
  )
}

function isChartUnavailable(
  series: MetricLineSeries[],
): boolean {
  return series.every((entry) =>
    entry.points.every(
      (point) => point.value === null || point.value === undefined,
    ),
  )
}

function lastFormattedValue(
  series: MetricLineSeries[],
  yFormat: (value: number) => string,
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
 * recent index where at least one has a sample — e.g. CPU utilization%, the
 * total of the busy bands, rather than any single band's own last value.
 */
function lastStackedTotal(
  series: MetricLineSeries[],
  yFormat: (value: number) => string,
): string {
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
  | 'loading'
  | 'unsupported-os'
  | 'backend-unavailable'
  | 'not-configured'
  | 'no-data'
  | 'charts'

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
  if (backend === 'analytics-engine') {
    return `Metrics charts are unavailable. ${HA_METRICS_LOCAL_NOTE}`
  }
  if (backend === 'duckdb') {
    return 'Metrics storage is still starting up (DuckDB). Retry in a moment.'
  }
  return 'Metrics storage is not configured for this runtime yet.'
}

function resolveViewState(
  server: OrgServerRecord | null | undefined,
  data: MetricsSeriesResponse | undefined,
  error: unknown,
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
  if (data.points.length === 0 || data.sampleCount === 0) {
    return 'no-data'
  }
  return 'charts'
}

function noDataCopy(
  updateAvailable: boolean,
  updating: boolean,
): {
  title: string
  body: string
} {
  if (updating) {
    return {
      title: 'Daemon is updating',
      body:
        'The daemon on this host is installing a new build. Metrics will appear after it reconnects.',
    }
  }
  if (updateAvailable) {
    return {
      title: 'Daemon update required',
      body:
        'This host is connected, but it is sending an older metrics protocol that this control plane cannot store. Update the daemon, then samples will appear.',
    }
  }
  return {
    title: 'Waiting for first samples',
    body:
      'No server metrics yet. Samples appear about one minute after the daemon connects and begins reporting.',
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
      <Text style={styles.rangeHint}>
        Shorter ranges auto-refresh while this page is open.
      </Text>
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
      return {
        border: colors.pending,
        stripe: colors.pending,
        title: colors.pending,
      }
    case 'error':
      return {
        border: colors.error,
        stripe: colors.error,
        title: colors.errorText,
      }
    case 'info':
      return {
        border: colors.command,
        stripe: colors.command,
        title: colors.command,
      }
    default:
      return {
        border: colors.borderArea,
        stripe: colors.accent,
        title: colors.textTitle,
      }
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
        {
          borderColor: toneStyle.border,
          borderLeftColor: toneStyle.stripe,
        },
      ]}
    >
      <Text style={[panelStyles.statePanelTitle, { color: toneStyle.title }]}>
        {title}
      </Text>
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
    queryError != null &&
    !(queryError instanceof MetricsBackendUnavailableError)
  const unavailableBackend =
    queryError instanceof MetricsBackendUnavailableError
      ? queryError.backend
      : backend
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
 * Legend chips beyond this count collapse into a single "Other" chip — past
 * a handful of bands you can't tell them apart on the chart anyway, and a
 * long tail of tiny chips just wraps the legend onto extra rows.
 */
const MAX_VISIBLE_LEGEND_ENTRIES = 5

/** Fallback for `MetricsSeriesResponse.cpuLimits` on a stale cache predating the field. */
const DEFAULT_CPU_LIMITS: EffectiveCpuThermalLimits = {
  tdpWatts: null,
  tjMaxCelsius: null,
  source: 'none',
}

/** Fallback for `MetricsSeriesResponse.generationBreaks` on a stale cache predating the field. */
const EMPTY_GENERATION_BREAKS: readonly number[] = []

function MetricsChartCard({
  definition,
  points,
  chartDomainMs,
  gapBands,
  xTickFormat,
  breakLines,
}: Readonly<{
  definition: ChartDefinition
  points: MetricsSeriesPoint[]
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
  breakLines?: readonly number[]
}>) {
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
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
        // Never let the last visible series be toggled off.
        if (next.size >= definition.series.length) return prev
        return next
      })
    },
    [definition.series.length],
  )

  const breakMs = useMemo(
    () => (breakLines && breakLines.length > 0 ? new Set(breakLines) : undefined),
    [breakLines],
  )
  const series = buildChartSeries(points, definition, breakMs)
  const unavailable = isChartUnavailable(series)
  const visibleSeries =
    series.length > 1
      ? series.filter((entry) => !hiddenKeys.has(entry.key))
      : series
  const headline = definition.stacked
    ? lastStackedTotal(visibleSeries, definition.yFormat)
    : lastFormattedValue(visibleSeries, definition.yFormat)

  const overflowAt =
    series.length > MAX_VISIBLE_LEGEND_ENTRIES
      ? MAX_VISIBLE_LEGEND_ENTRIES - 1
      : series.length
  const primarySeries = series.slice(0, overflowAt)
  const overflowSeries = series.slice(overflowAt)

  const legendEntries = primarySeries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    lastValue: lastFormattedValue([entry], definition.yFormat),
    hidden: hiddenKeys.has(entry.key),
    onPress:
      series.length > 1 ? () => toggleSeries([entry.key]) : undefined,
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

  const caption = unavailable ? undefined : (definition.computeCaption?.(points) ?? undefined)
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
      caption={caption}
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

function CollapsibleChartGroup({
  group,
  defaultExpanded,
  twoColumn,
  points,
  chartDomainMs,
  gapBands,
  xTickFormat,
  chartsById,
  breakLines,
  forceHidden,
}: Readonly<{
  group: ChartGroupDefinition
  defaultExpanded: boolean
  twoColumn: boolean
  points: MetricsSeriesPoint[]
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
  chartsById: Map<string, ChartDefinition>
  breakLines?: readonly number[]
  /** Hides the whole group regardless of per-chart data — e.g. hardware sensors never reported. */
  forceHidden?: boolean
}>) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  // hideWhenEmpty cards (docker storage, hardware sensors) drop out entirely
  // when nothing reported in range — a missing sensor is absence, not zero.
  const charts = group.chartIds
    .map((id) => chartsById.get(id))
    .filter((entry): entry is ChartDefinition => entry != null)
    .filter(
      (definition) =>
        !definition.hideWhenEmpty || chartHasAnyData(points, definition),
    )

  if (forceHidden || charts.length === 0) return null

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
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${group.label} charts`}
      >
        <Text style={[styles.chartGroupChevron, expanded && styles.chartGroupChevronOpen]}>
          {expanded ? '▾' : '▸'}
        </Text>
        <View style={styles.chartGroupCopy}>
          <Text style={styles.chartGroupTitle}>{group.label}</Text>
          <Text style={styles.chartGroupHint}>{group.hint}</Text>
        </View>
        <View style={[styles.chartGroupCount, expanded && styles.chartGroupCountActive]}>
          <Text style={[styles.chartGroupCountText, expanded && styles.chartGroupCountTextActive]}>
            {charts.length}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <>
          {group.note ? (
            <Text style={styles.chartGroupNote}>{group.note}</Text>
          ) : null}
          <View style={[styles.chartGrid, twoColumn ? styles.chartGridTwo : null]}>
            {charts.map((definition) => (
              <MetricsChartCard
                key={definition.id}
                definition={definition}
                points={points}
                chartDomainMs={chartDomainMs}
                gapBands={gapBands}
                xTickFormat={xTickFormat}
                breakLines={breakLines}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}

function latestReadValue(
  points: MetricsSeriesPoint[],
  read: PointValueReader,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = read(points[index]!)
    if (value != null) return value
  }
  return null
}

/** Latest-value rollup above the chart groups — derived numbers, not a chart. */
function MetricsOverviewTiles({
  points,
  server,
}: Readonly<{
  points: MetricsSeriesPoint[]
  server: OrgServerRecord | null
}>) {
  const cpuBusy = latestReadValue(points, readCpuBusy)
  const cpuCores = server ? serverInventoryCpuCores(server) : null
  const cpuModel = server?.resources?.cpus?.[0]?.name ?? null
  const cpuHardwareLabel = [
    cpuCores != null ? `${formatCoresTotal(cpuCores)} cores` : null,
    cpuModel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' \u00b7 ')
  const memoryUsed = latestReadValue(points, (point) =>
    memoryUsedPercentFrom(
      point.values.memoryTotalBytes ?? null,
      point.values.memoryAvailableBytes ?? null,
    ),
  )
  const hostingUsed = latestReadValue(
    points,
    usedPercent('hostingStorageTotalBytes', 'hostingStorageAvailableBytes'),
  )
  const uplinkRx = latestReadValue(
    points,
    metric('interfaceReceiveBytesPerSecond'),
  )
  const uplinkTx = latestReadValue(
    points,
    metric('interfaceTransmitBytesPerSecond'),
  )
  const uplink =
    uplinkRx == null && uplinkTx == null
      ? null
      : (uplinkRx ?? 0) + (uplinkTx ?? 0)
  const processes = latestReadValue(points, metric('processCount'))
  const uptime = latestReadValue(points, metric('uptimeSeconds'))

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
            key: 'hosting',
            icon: StorageMetricIcon,
            value: formatPercent(hostingUsed),
            label: 'HOSTING USED',
            accessibilityLabel: `Hosting storage used ${formatPercent(hostingUsed)}`,
          },
          {
            key: 'uplink',
            icon: NetworkMetricIcon,
            value: formatBytesPerSecond(uplink),
            label: 'UPLINK',
            accessibilityLabel: `Uplink throughput ${formatBytesPerSecond(uplink)}`,
          },
          {
            key: 'processes',
            icon: ProcessMetricIcon,
            value: formatCount(processes),
            label: 'PROCESSES',
            accessibilityLabel: `${formatCount(processes)} processes`,
          },
          {
            key: 'uptime',
            icon: UptimeMetricIcon,
            value: formatUptimeSeconds(uptime),
            label: 'UPTIME',
            accessibilityLabel: `Uptime ${formatUptimeSeconds(uptime)}`,
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
 * the range changes or the screen unmounts. The session is keyed on `rangeId`,
 * not just live eligibility, so switching between the live ranges (5m ↔ 10m)
 * stops the current lease before starting one for the new range. This hook
 * must only ever run on the single-server Metrics screen — never in fleet
 * views.
 */
function useLiveMetricsSession(
  orgId: string,
  serverId: string,
  active: boolean,
  rangeId: MetricsRangeId,
): { state: LiveSessionState; restart: () => void } {
  const startMutation = useStartServerMetricsLive(orgId, serverId)
  const stopMutation = useStopServerMetricsLive(orgId, serverId)
  // React Query mutate functions are referentially stable — safe effect deps.
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
      let outcome: MetricsLiveStartOutcome
      try {
        outcome = await startLive(undefined)
      } catch {
        // Transport failure — quietly stay on baseline sampling.
        if (!cancelled) setState({ kind: 'idle' })
        return
      }
      if (cancelled) {
        // Left live mode before the lease landed — release it immediately.
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
        <Text style={styles.liveMeta}>
          · {state.intervalSeconds} second sampling
        </Text>
      </View>
    )
  }
  if (state.kind === 'ended') {
    return (
      <View style={styles.liveRow}>
        <View style={styles.liveDotEnded} />
        <Text style={styles.liveMeta}>
          Live session ended · 1 minute sampling
        </Text>
        <Button
          label="Restart live session"
          variant="secondary"
          onPress={onRestart}
        />
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
  // 'disabled' (admin cap is 0) and 'idle' fall back silently to baseline.
  return null
}

function MetricsCharts({
  data,
  normalizedMetrics,
  chartDomainMs,
  expectedSamples,
  presentSamples,
  coverageLabel,
  resolutionLabel,
  twoColumn,
  rangeId,
  server,
  hardwareProfile,
}: Readonly<{
  data: MetricsSeriesResponse
  normalizedMetrics: ReturnType<typeof normalizeMetricsGrid> | null
  chartDomainMs: readonly [number, number]
  expectedSamples: number
  presentSamples: number
  coverageLabel: string | null
  resolutionLabel: string
  twoColumn: boolean
  rangeId: MetricsRangeId
  server: OrgServerRecord | null
  hardwareProfile: ServerHardwareProfile | null | undefined
}>) {
  const points = normalizedMetrics?.points ?? data.points
  const gapBands = normalizedMetrics?.gapBands ?? []
  const xTickFormat = (ms: number) => formatAxisTime(ms, rangeId)

  // Defensive against a stale cache from an older instance predating these
  // fields (same discipline as `normalizeOrgServer`) — never let a missing
  // field throw mid-render.
  const cpuLimits = data.cpuLimits ?? DEFAULT_CPU_LIMITS
  const generationBreaks = data.generationBreaks ?? EMPTY_GENERATION_BREAKS

  const chartsById = useMemo(
    () => resolveChartDefinitions(hardwareProfile, data.temperatureUnit, cpuLimits),
    [hardwareProfile, data.temperatureUnit, cpuLimits],
  )

  // Hardware-profile generation boundaries — mapped from the server's own
  // point order (not the client-normalized grid, whose indices shift after
  // gap-filling) to timestamps every chart understands.
  const breakLines = useMemo(() => {
    if (generationBreaks.length === 0) return undefined
    return generationBreaks
      .map((index) => Date.parse(data.points[index]?.at ?? ''))
      .filter((ms) => Number.isFinite(ms))
  }, [generationBreaks, data.points])

  const coveragePercent =
    expectedSamples > 0 ? (presentSamples / expectedSamples) * 100 : 0
  const gapPercent = Math.max(0, 100 - coveragePercent)

  return (
    <>
      <MetricsOverviewTiles points={points} server={server} />

      <View style={styles.coverageStrip}>
        <View style={styles.coverageHeader}>
          <Text style={styles.coverageText}>
            Sample coverage {coverageLabel ?? '—'}
          </Text>
          {data.gapCount > 0 ? (
            <View style={styles.gapBadge}>
              <Text style={styles.gapBadgeText}>
                {data.gapCount} {data.gapCount === 1 ? 'gap' : 'gaps'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.coverageBarTrack}>
          <View
            style={[
              styles.coverageBarFill,
              { width: `${Math.min(100, coveragePercent)}%` },
            ]}
          />
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
          <Text style={styles.coverageMeta}>
            Resolution {resolutionLabel} · ~60 s cadence
          </Text>
          <Text style={styles.coverageMetaDim}>
            Amber bands = missing samples (not zero)
          </Text>
        </View>
      </View>

      {CHART_GROUPS.map((group, index) => {
        const isHardwareGroup = group.id === 'hardware'
        const forceHidden = isHardwareGroup && !data.sensorsAvailable
        return (
          <Fragment key={group.id}>
            <CollapsibleChartGroup
              group={group}
              defaultExpanded={index < 2}
              twoColumn={twoColumn}
              points={points}
              chartDomainMs={chartDomainMs}
              gapBands={gapBands}
              xTickFormat={xTickFormat}
              chartsById={chartsById}
              breakLines={breakLines}
              forceHidden={forceHidden}
            />
            {forceHidden ? (
              <Text style={styles.chartGroupNote}>
                Hardware sensors are not available on this host (common for
                virtual machines).
              </Text>
            ) : null}
          </Fragment>
        )
      })}

      <SectionPanel title="Coverage detail" hint="Gap accounting for this range">
        <View style={styles.coverageChartMeta}>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Present</Text>
            <Text style={styles.coverageStatValue}>{presentSamples}</Text>
          </View>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Gaps</Text>
            <Text style={[styles.coverageStatValue, styles.coverageStatGap]}>
              {data.gapCount}
            </Text>
          </View>
          <View style={styles.coverageStat}>
            <Text style={styles.coverageStatLabel}>Expected</Text>
            <Text style={styles.coverageStatValue}>
              {expectedSamples || '—'}
            </Text>
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
  normalizedMetrics: ReturnType<typeof normalizeMetricsGrid> | null,
  rangeId: MetricsRangeId,
): [number, number] {
  if (normalizedMetrics) {
    return [normalizedMetrics.fromMs, normalizedMetrics.toMs]
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
  normalizedMetrics: ReturnType<typeof normalizeMetricsGrid> | null,
): Readonly<{
  expectedSamples: number
  presentSamples: number
  coverageLabel: string | null
}> {
  if (!data) {
    return { expectedSamples: 0, presentSamples: 0, coverageLabel: null }
  }
  const expectedSamples =
    normalizedMetrics?.expectedSamples ?? data.sampleCount + data.gapCount
  const presentSamples = presentSamplesFromGaps(expectedSamples, data.gapCount)
  const coverageLabel =
    expectedSamples > 0
      ? formatCoveragePercent(presentSamples, expectedSamples)
      : null
  return { expectedSamples, presentSamples, coverageLabel }
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
  // Hardware-profile labels (NIC/disk sensor identities) live only on the
  // detail record — `useOrgServers` is the list shape and omits them. When
  // embedded on the server detail screen this is a cache hit, not an extra
  // round trip.
  const serverDetailQuery = useServerDetail(orgId, serverId)
  const updateStatusQuery = useServerUpdateStatus(orgId, serverId)
  const triggerUpdateMutation = useTriggerServerUpdate(orgId, serverId)
  const canManage = useCan('organization', orgId, 'organization:manage')

  // Live sampling is scoped to this single-server screen at 5m/10m only —
  // fleet/overview surfaces never acquire a lease.
  const liveEligible = isLiveRange(rangeId)
  const live = useLiveMetricsSession(orgId, serverId, liveEligible, rangeId)
  const liveActive = live.state.kind === 'live'

  const metricsQuery = useServerMetricsSeries(
    orgId,
    serverId,
    // Getter + stable rangeKey: interval refetches advance the window to
    // "now" instead of re-reading the window frozen at range selection.
    () => {
      const bounds = computeRangeBounds(rangeId)
      return { fromIso: bounds.fromIso, toIso: bounds.toIso }
    },
    {
      refetchInterval: liveActive ? LIVE_REFETCH_MS : timing.refetchInterval,
      staleTime: liveActive ? LIVE_REFETCH_MS / 2 : timing.staleTime,
      rangeKey: rangeId,
    },
  )

  const server =
    serversQuery.data?.servers.find((row) => row.id === serverId) ?? null
  const hardwareProfile = serverDetailQuery.data?.hardwareProfile
  const data = metricsQuery.data
  const viewState = resolveViewState(server, data, metricsQuery.error)
  const stale = isServerStale(server)
  const updateAvailable = updateStatusQuery.data?.updateAvailable === true
  const updating =
    triggerUpdateMutation.isPending ||
    updateStatusQuery.data?.status === 'updating'

  const normalizedMetrics = useMemo(
    () => (data ? normalizeMetricsGrid(data) : null),
    [data],
  )

  const chartDomainMs = useMemo(
    () => resolveChartDomainMs(data, normalizedMetrics, rangeId),
    [data, normalizedMetrics, rangeId],
  )

  const { expectedSamples, presentSamples, coverageLabel } = resolveSampleStats(
    data,
    normalizedMetrics,
  )

  const resolutionLabel =
    data?.resolutionSeconds != null
      ? `${data.resolutionSeconds}s`
      : 'auto'

  const handleRetry = () => {
    metricsQuery.refetch().catch(() => {
      // Errors surface via React Query state.
    })
  }

  return (
    <View style={styles.root}>
      {!embedded ? (
        <>
          <Text style={panelStyles.pageTitle}>
            {server ? serverTitle(server) : 'Server'} · Metrics
          </Text>
          <Text style={panelStyles.pageCopy}>
            Host metrics sampled about once per minute. The 5m and 10m ranges
            switch to 10-second live sampling while this page is open.
          </Text>
        </>
      ) : null}

      <SectionPanel title="Time range" hint="Auto-refresh on shorter ranges" accent>
        <RangePicker rangeId={rangeId} onChange={setRangeId} />
        {liveEligible ? (
          <LiveModeIndicator state={live.state} onRestart={live.restart} />
        ) : null}
      </SectionPanel>

      {metricsQuery.isFetching && data ? (
        <View style={styles.refetchBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={panelStyles.muted}>Refreshing charts…</Text>
        </View>
      ) : null}

      {stale && viewState === 'charts' ? (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineBannerDot} />
          <View style={styles.offlineBannerCopy}>
            <Text style={styles.offlineBannerTitle}>Server offline</Text>
            <Text style={styles.offlineBannerText}>
              Charts may show stale data until the host reconnects.
            </Text>
          </View>
        </View>
      ) : null}

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

      {viewState === 'charts' && data ? (
        <MetricsCharts
          data={data}
          normalizedMetrics={normalizedMetrics}
          chartDomainMs={chartDomainMs}
          expectedSamples={expectedSamples}
          presentSamples={presentSamples}
          coverageLabel={coverageLabel}
          resolutionLabel={resolutionLabel}
          twoColumn={twoColumn}
          rangeId={rangeId}
          server={server}
          hardwareProfile={hardwareProfile}
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
})
