import { useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/ui'
import { ChartCard } from '@/components/org/charts/chart-card'
import { ChartLegend } from '@/components/org/charts/chart-legend'
import {
  MetricLineChart,
  type MetricGapBand,
  type MetricLineSeries,
} from '@/components/org/charts/metric-line-chart'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  formatAxisTime,
  formatBytes,
  formatBytesPerSecond,
  formatCount,
  formatCoveragePercent,
  formatOpsPerSecond,
  formatPercent,
  formatUptimeSeconds,
  presentSamplesFromGaps,
  type MetricsRangeId,
} from '@/lib/format-metrics'
import {
  MetricsBackendUnavailableError,
  type MetricsBackendKind,
  type HostMetricKey,
  type OrgServerRecord,
  type MetricsSeriesPoint,
  type MetricsSeriesResponse,
} from '@/lib/instance-api'
import { HA_METRICS_LOCAL_NOTE } from '@/lib/platform-copy'
import { useOrgServers, useServerMetricsSeries } from '@/lib/queries/servers'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

const RANGE_OPTIONS: readonly {
  id: MetricsRangeId
  label: string
}[] = [
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
]

const RANGE_MS: Record<MetricsRangeId, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  '90d': 7_776_000_000,
}

const SERIES_COLORS = [
  colors.accent,
  colors.command,
  colors.pending,
  colors.errorSoft,
  colors.log,
  colors.textChip,
] as const

type ChartDefinition = Readonly<{
  id: string
  title: string
  unit: string
  keys: readonly HostMetricKey[]
  labels: readonly string[]
  yFormat: (value: number) => string
  yDomain?: readonly [number, number]
  area?: boolean
}>

const CHART_DEFINITIONS: readonly ChartDefinition[] = [
  {
    id: 'cpu',
    title: 'CPU usage',
    unit: '%',
    keys: [
      'cpuUsagePercent',
      'cpuUserPercent',
      'cpuSystemPercent',
      'cpuIowaitPercent',
    ],
    labels: ['Total', 'User', 'System', 'I/O wait'],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
  },
  {
    id: 'load',
    title: 'Load average',
    unit: 'load',
    keys: ['load1', 'load5', 'load15'],
    labels: ['1m', '5m', '15m'],
    yFormat: (v) => v.toFixed(2),
  },
  {
    id: 'memory-percent',
    title: 'Memory & swap',
    unit: '%',
    keys: ['memoryUsedPercent', 'swapUsedPercent'],
    labels: ['Memory used', 'Swap used'],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
  },
  {
    id: 'memory-bytes',
    title: 'Memory bytes',
    unit: 'bytes',
    keys: ['memoryUsedBytes', 'memoryAvailableBytes'],
    labels: ['Used', 'Available'],
    yFormat: (v) => formatBytes(v),
  },
  {
    id: 'disk-percent',
    title: 'Root disk usage',
    unit: '%',
    keys: ['diskUsedPercent'],
    labels: ['Used'],
    yFormat: (v) => formatPercent(v),
    yDomain: [0, 100],
    area: true,
  },
  {
    id: 'disk-throughput',
    title: 'Disk throughput',
    unit: 'B/s',
    keys: ['diskReadBytesPerSecond', 'diskWriteBytesPerSecond'],
    labels: ['Read', 'Write'],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    id: 'disk-ops',
    title: 'Disk operations',
    unit: 'ops/s',
    keys: ['diskReadOpsPerSecond', 'diskWriteOpsPerSecond'],
    labels: ['Read', 'Write'],
    yFormat: (v) => formatOpsPerSecond(v),
  },
  {
    id: 'network',
    title: 'Network throughput',
    unit: 'B/s',
    keys: [
      'networkReceiveBytesPerSecond',
      'networkTransmitBytesPerSecond',
    ],
    labels: ['Receive', 'Transmit'],
    yFormat: (v) => formatBytesPerSecond(v),
  },
  {
    id: 'processes',
    title: 'Process count',
    unit: 'count',
    keys: ['processCount'],
    labels: ['Processes'],
    yFormat: (v) => formatCount(v),
  },
  {
    id: 'uptime',
    title: 'Uptime',
    unit: 'duration',
    keys: ['uptimeSeconds'],
    labels: ['Uptime'],
    yFormat: (v) => formatUptimeSeconds(v),
  },
]

type ChartGroupDefinition = Readonly<{
  id: string
  label: string
  hint: string
  chartIds: readonly string[]
}>

const CHART_GROUPS: readonly ChartGroupDefinition[] = [
  {
    id: 'compute',
    label: 'Compute',
    hint: 'CPU and load average',
    chartIds: ['cpu', 'load'],
  },
  {
    id: 'memory',
    label: 'Memory',
    hint: 'RAM and swap utilization',
    chartIds: ['memory-percent', 'memory-bytes'],
  },
  {
    id: 'disk',
    label: 'Disk',
    hint: 'Usage, throughput, and I/O ops',
    chartIds: ['disk-percent', 'disk-throughput', 'disk-ops'],
  },
  {
    id: 'network',
    label: 'Network',
    hint: 'Receive and transmit throughput',
    chartIds: ['network'],
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Process count and uptime',
    chartIds: ['processes', 'uptime'],
  },
]

const CHARTS_BY_ID = new Map(
  CHART_DEFINITIONS.map((definition) => [definition.id, definition]),
)

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function rangeQueryTiming(rangeId: MetricsRangeId): {
  refetchInterval: number | false
  staleTime: number
} {
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

function buildChartSeries(
  points: MetricsSeriesPoint[],
  definition: ChartDefinition,
): MetricLineSeries[] {
  return definition.keys.map((key, index) => ({
    key,
    label: definition.labels[index] ?? key,
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
    points: points.map((point) => ({
      tMs: Date.parse(point.at),
      value: point.values[key] ?? null,
    })),
  }))
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
    case 'clickhouse':
      return 'ClickHouse'
    default:
      return 'metrics storage'
  }
}

function metricsNotConfiguredCopy(backend: MetricsBackendKind): string {
  if (backend === 'analytics-engine') {
    return `Metrics charts are unavailable. ${HA_METRICS_LOCAL_NOTE}`
  }
  if (backend === 'clickhouse') {
    return 'Metrics storage is still starting up (ClickHouse). Retry in a moment.'
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
}: Readonly<{
  viewState: MetricsViewState
  backend: MetricsBackendKind
  isLoading: boolean
  hasData: boolean
  queryError: unknown
  onRetry: () => void
}>) {
  const showGenericError =
    queryError != null &&
    !(queryError instanceof MetricsBackendUnavailableError)
  const unavailableBackend =
    queryError instanceof MetricsBackendUnavailableError
      ? queryError.backend
      : backend

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
          title="Waiting for first samples"
          body="No server metrics yet. Samples appear about one minute after the daemon connects and begins reporting."
        />
      ) : null}
    </>
  )
}

function MetricsChartCard({
  definition,
  points,
  chartDomainMs,
  gapBands,
  xTickFormat,
}: Readonly<{
  definition: ChartDefinition
  points: MetricsSeriesPoint[]
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
}>) {
  const series = buildChartSeries(points, definition)
  const unavailable = isChartUnavailable(series)
  const legendEntries = series.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    lastValue: lastFormattedValue([entry], definition.yFormat),
  }))
  const headline = lastFormattedValue(series, definition.yFormat)

  return (
    <ChartCard
      title={definition.title}
      subtitle={definition.unit}
      headline={unavailable ? undefined : headline}
      legend={<ChartLegend entries={legendEntries} />}
      unavailable={unavailable}
    >
      <MetricLineChart
        series={series}
        xDomainMs={chartDomainMs}
        height={220}
        yFormat={definition.yFormat}
        yDomain={definition.yDomain}
        area={definition.area}
        gapBands={gapBands}
        xTickFormat={xTickFormat}
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
}: Readonly<{
  group: ChartGroupDefinition
  defaultExpanded: boolean
  twoColumn: boolean
  points: MetricsSeriesPoint[]
  chartDomainMs: readonly [number, number]
  gapBands: MetricGapBand[]
  xTickFormat: (ms: number) => string
}>) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const charts = group.chartIds
    .map((id) => CHARTS_BY_ID.get(id))
    .filter((entry): entry is ChartDefinition => entry != null)

  if (charts.length === 0) return null

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
        <View style={[styles.chartGrid, twoColumn ? styles.chartGridTwo : null]}>
          {charts.map((definition) => (
            <MetricsChartCard
              key={definition.id}
              definition={definition}
              points={points}
              chartDomainMs={chartDomainMs}
              gapBands={gapBands}
              xTickFormat={xTickFormat}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
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
}>) {
  const points = normalizedMetrics?.points ?? data.points
  const gapBands = normalizedMetrics?.gapBands ?? []
  const xTickFormat = (ms: number) => formatAxisTime(ms, rangeId)

  const coveragePercent =
    expectedSamples > 0 ? (presentSamples / expectedSamples) * 100 : 0
  const gapPercent = Math.max(0, 100 - coveragePercent)

  return (
    <>
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

      {CHART_GROUPS.map((group, index) => (
        <CollapsibleChartGroup
          key={group.id}
          group={group}
          defaultExpanded={index < 2}
          twoColumn={twoColumn}
          points={points}
          chartDomainMs={chartDomainMs}
          gapBands={gapBands}
          xTickFormat={xTickFormat}
        />
      ))}

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

export function ServerMetricsSection({
  orgId,
  serverId,
  embedded = false,
}: Readonly<{ orgId: string; serverId: string; embedded?: boolean }>) {
  const { width } = useWindowDimensions()
  const [rangeId, setRangeId] = useState<MetricsRangeId>('1h')
  const timing = rangeQueryTiming(rangeId)
  const twoColumn = width >= layout.desktopBreakpoint
  const bounds = useMemo(() => computeRangeBounds(rangeId), [rangeId])

  const serversQuery = useOrgServers(orgId)

  const metricsQuery = useServerMetricsSeries(
    orgId,
    serverId,
    {
      fromIso: bounds.fromIso,
      toIso: bounds.toIso,
    },
    {
      refetchInterval: timing.refetchInterval,
      staleTime: timing.staleTime,
    },
  )

  const server =
    serversQuery.data?.servers.find((row) => row.id === serverId) ?? null
  const data = metricsQuery.data
  const viewState = resolveViewState(server, data, metricsQuery.error)
  const stale = isServerStale(server)

  const normalizedMetrics = useMemo(
    () => (data ? normalizeMetricsGrid(data) : null),
    [data],
  )

  const chartDomainMs = useMemo(
    () => resolveChartDomainMs(data, normalizedMetrics, rangeId),
    [data, normalizedMetrics, rangeId],
  )

  const expectedSamples =
    normalizedMetrics?.expectedSamples ??
    (data ? data.sampleCount + data.gapCount : 0)
  const presentSamples = data
    ? presentSamplesFromGaps(expectedSamples, data.gapCount)
    : 0
  const coverageLabel =
    data && expectedSamples > 0
      ? formatCoveragePercent(presentSamples, expectedSamples)
      : null

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
            Host metrics sampled about once per minute. Charts use the backend
            resolution for this range — not live sub-second data.
          </Text>
        </>
      ) : null}

      <SectionPanel title="Time range" hint="Auto-refresh on shorter ranges" accent>
        <RangePicker rangeId={rangeId} onChange={setRangeId} />
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
