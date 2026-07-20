import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { ChartCard } from '@/components/org/charts/chart-card'
import { ChartLegend } from '@/components/org/charts/chart-legend'
import {
  MetricLineChart,
  type MetricGapBand,
  type MetricLineSeries,
} from '@/components/org/charts/metric-line-chart'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
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
  fetchOrgServers,
  fetchServerMetricsSeries,
  MetricsBackendUnavailableError,
  type MetricsBackendKind,
  type HostMetricKey,
  type OrgServerRecord,
  type MetricsSeriesPoint,
  type MetricsSeriesResponse,
} from '@/lib/instance-api'
import { useForbiddenRecovery } from '@/lib/query-client'
import { colors, layout, spacing } from '@/lib/theme'

const RANGE_OPTIONS: ReadonlyArray<{
  id: MetricsRangeId
  label: string
}> = [
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
  '#c792ea',
  '#f78c6c',
  '#82aaff',
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

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
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
  // Presence is authoritative from Postgres `server.daemon.status.connected`
  // (maintained by connect/disconnect + the offline sweep), the same signal the
  // servers overview uses. `lastInboundAt` (Postgres `lastSeenAt`) is NOT a
  // sub-few-minutes freshness signal: steady-state daemons only send wire cell
  // pings, which refresh cell meta but not the Postgres projection, so it
  // freezes at the last connect/heartbeat and would false-trip an offline
  // banner on a healthy long-lived connection.
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
    return (
      'Metrics charts are unavailable. Wrangler dev does not emulate Analytics Engine ' +
      'locally — switch to Deno instance mode (ClickHouse) for local metrics charts. ' +
      'On deployed Workers, chart queries also need TURBOPANEL_ANALYTICS_ENGINE_API_TOKEN.'
    )
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

function formatGapSuffix(gapCount: number): string {
  if (gapCount <= 0) return ''
  const noun = gapCount === 1 ? 'gap' : 'gaps'
  return ` · ${gapCount} ${noun}`
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
      {RANGE_OPTIONS.map((option) => {
        const active = option.id === rangeId
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[styles.rangeChip, active ? styles.rangeChipActive : null]}
          >
            <Text
              style={[
                styles.rangeChipText,
                active ? styles.rangeChipTextActive : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
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
      {isLoading && !hasData ? <ActivityIndicator color={colors.accent} /> : null}

      {showGenericError ? (
        <Text style={orgPanelStyles.error}>
          {metricsErrorMessage(queryError)}
        </Text>
      ) : null}

      {viewState === 'unsupported-os' ? (
        <Text style={orgPanelStyles.muted}>
          Server metrics not supported on this OS
        </Text>
      ) : null}

      {viewState === 'backend-unavailable' ? (
        <View style={styles.stateBlock}>
          <Text style={orgPanelStyles.error}>
            Metrics store unavailable ({metricsBackendLabel(unavailableBackend)})
          </Text>
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {viewState === 'not-configured' ? (
        <Text style={orgPanelStyles.muted}>
          {metricsNotConfiguredCopy(backend)}
        </Text>
      ) : null}

      {viewState === 'no-data' ? (
        <Text style={orgPanelStyles.muted}>
          No server metrics yet — samples appear ~1 min after the daemon connects
        </Text>
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

  return (
    <ChartCard
      title={definition.title}
      subtitle={definition.unit}
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

  return (
    <>
      <View style={styles.coverageStrip}>
        <Text style={styles.coverageText}>
          Coverage {coverageLabel ?? '—'}
          {formatGapSuffix(data.gapCount)}
        </Text>
        <Text style={styles.coverageMeta}>
          Updated ~every minute · resolution {resolutionLabel}
        </Text>
      </View>

      <View style={[styles.chartGrid, twoColumn ? styles.chartGridTwo : null]}>
        {CHART_DEFINITIONS.map((definition) => (
          <MetricsChartCard
            key={definition.id}
            definition={definition}
            points={points}
            chartDomainMs={chartDomainMs}
            gapBands={gapBands}
            xTickFormat={xTickFormat}
          />
        ))}

        <ChartCard title="Sample coverage" subtitle="coverage">
          <View style={styles.coverageChartMeta}>
            <Text style={styles.coverageDetail}>
              Present: {presentSamples}
            </Text>
            <Text style={styles.coverageDetail}>Gaps: {data.gapCount}</Text>
            <Text style={styles.coverageDetail}>
              Expected: {expectedSamples || '—'}
            </Text>
            <Text style={styles.coverageDetail}>
              Coverage: {coverageLabel ?? '—'}
            </Text>
          </View>
        </ChartCard>
      </View>
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
}: Readonly<{ orgId: string; serverId: string }>) {
  const { width } = useWindowDimensions()
  const [rangeId, setRangeId] = useState<MetricsRangeId>('1h')
  const timing = rangeQueryTiming(rangeId)
  const twoColumn = width >= layout.desktopBreakpoint

  const serversQuery = useQuery({
    queryKey: ['org-servers', orgId],
    queryFn: fetchOrgServers,
    staleTime: 60_000,
  })

  const metricsQuery = useQuery({
    queryKey: ['metrics-series', serverId, rangeId],
    queryFn: () => {
      const bounds = computeRangeBounds(rangeId)
      return fetchServerMetricsSeries(
        serverId,
        {
          fromIso: bounds.fromIso,
          toIso: bounds.toIso,
        },
        orgId,
      )
    },
    refetchInterval: timing.refetchInterval,
    staleTime: timing.staleTime,
  })

  useForbiddenRecovery(metricsQuery.error ?? serversQuery.error)

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
      <Text style={styles.heading}>
        {server ? serverTitle(server) : 'Server'} · Metrics
      </Text>
      <Text style={styles.copy}>
        Host metrics sampled about once per minute. Charts use the backend
        resolution for this range — not live sub-second data.
      </Text>

      <RangePicker rangeId={rangeId} onChange={setRangeId} />

      {stale && viewState === 'charts' ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Server offline — data may be stale
          </Text>
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
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rangeChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  rangeChipText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  rangeChipTextActive: {
    color: colors.accent,
  },
  offlineBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offlineBannerText: {
    color: colors.pending,
    fontSize: 13,
    fontWeight: '600',
  },
  stateBlock: {
    gap: spacing.sm,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  coverageStrip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  coverageText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  coverageMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  chartGrid: {
    gap: spacing.lg,
  },
  chartGridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coverageChartMeta: {
    gap: spacing.xs,
  },
  coverageDetail: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: 'monospace',
  },
})
