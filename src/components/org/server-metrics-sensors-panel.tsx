import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EmptyState, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  attributedSignalTitle,
  gpuSignalId,
  isNvmeCompositeSignal,
  sensorCommandsFor,
} from '@/lib/sensor-commands'
import { formatPhysicalSignalValue, type TemperatureUnit } from '@/lib/format-metrics'
import {
  formatEntityMetricId,
  MetricsBackendUnavailableError,
  type EntitySeriesResult,
  type GpuInventoryEntry,
  type HardwareSignalInventoryEntry,
  type PerEntityHostedFamily,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { useServerMetricsSeries } from '@/lib/queries/servers'
import { colors, spacing } from '@/lib/theme'

/** Short recent window — this is a latest-reading summary, not a chart; the Metrics tab owns history. */
const SENSORS_PANEL_RANGE_MS = 10 * 60 * 1000

// GPU temperature and power draw are not `gpu`-family fields — they are
// `hardware.physical` signals keyed to the owning GPU, already covered by
// this panel's per-signal request below (`gpuSignalId`). Only workload
// telemetry is read off the `gpu` family here.
const GPU_SUMMARY_FIELDS = ['utilizationPercent'] as const
const HARDWARE_SIGNAL_SUMMARY_FIELDS = ['value'] as const

function computeSensorsPanelRange(): { fromIso: string; toIso: string } {
  const toMs = Date.now()
  return {
    fromIso: new Date(toMs - SENSORS_PANEL_RANGE_MS).toISOString(),
    toIso: new Date(toMs).toISOString(),
  }
}

/** Most recent non-null sample for one entity field, or `null` if none reported in range. */
function latestEntityValue(
  entities: readonly EntitySeriesResult[] | undefined,
  family: PerEntityHostedFamily,
  entityId: string,
  field: string
): number | null {
  const result = entities?.find((entry) => entry.family === family)
  const entity = result?.entities.find((entry) => entry.entityId === entityId)
  if (!entity) return null
  for (let index = entity.points.length - 1; index >= 0; index -= 1) {
    const value = entity.points[index]?.values[field]
    if (value != null && Number.isFinite(value)) return value
  }
  return null
}

function GpuRow({
  gpu,
  utilizationPercent,
  temperatureCelsius,
  powerWatts,
  temperatureUnit,
}: Readonly<{
  gpu: GpuInventoryEntry
  utilizationPercent: number | null
  temperatureCelsius: number | null
  powerWatts: number | null
  temperatureUnit: TemperatureUnit
}>) {
  const title = `${gpu.vendor} ${gpu.chip}`.trim() || gpu.gpuId
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{gpu.kind}</Text>
      </View>
      <View style={styles.rowValues}>
        <Text style={styles.rowValue}>
          Utilization {formatPhysicalSignalValue(utilizationPercent, 'percent', temperatureUnit)}
        </Text>
        <Text style={styles.rowValue}>
          Temp {formatPhysicalSignalValue(temperatureCelsius, 'celsius', temperatureUnit)}
        </Text>
        <Text style={styles.rowValue}>
          Power {formatPhysicalSignalValue(powerWatts, 'watts', temperatureUnit)}
        </Text>
      </View>
    </View>
  )
}

function SignalRow({
  signal,
  value,
  temperatureUnit,
}: Readonly<{
  signal: HardwareSignalInventoryEntry
  value: number | null
  temperatureUnit: TemperatureUnit
}>) {
  const threshold = signal.thresholds?.critical ?? signal.thresholds?.warning
  let thresholdLabel: string | null = null
  if (threshold != null) {
    const severity = signal.thresholds?.critical != null ? 'Critical' : 'Warning'
    thresholdLabel = `${severity} ${formatPhysicalSignalValue(threshold, signal.unit, temperatureUnit)}`
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{attributedSignalTitle(signal)}</Text>
        <Text style={styles.rowMeta}>
          {isNvmeCompositeSignal(signal)
            ? 'Whole-drive temperature — the value the drive throttles on'
            : signal.kind}
        </Text>
        <Text style={styles.rowCommand} selectable>
          {sensorCommandsFor(signal)[0]?.command ?? ''}
        </Text>
      </View>
      <View style={styles.rowValues}>
        <Text style={styles.rowValue}>
          {formatPhysicalSignalValue(value, signal.unit, temperatureUnit)}
        </Text>
        {thresholdLabel ? <Text style={styles.rowMeta}>{thresholdLabel}</Text> : null}
      </View>
    </View>
  )
}

/**
 * Read-only, topology-labeled summary of this server's GPU and physical
 * (temperature/power/fan/etc.) signals — every entry comes from the current
 * topology inventory, keyed by its own reported label/kind/unit, never a
 * fixed disk1/disk2/ambient slot. No chart surface here (that lives on the
 * Metrics tab's GPU/Physical signals groups) — this is a latest-reading
 * glance. Sensor-source overrides live in `ServerHardwareProfileEditor`.
 */
export function ServerMetricsSensorsPanel({
  orgId,
  server,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
}>) {
  const hostQuery = useServerMetricsSeries(
    orgId,
    server.id,
    // A single cheap host id, not the full default set — this call exists only to seed
    // `inventory`/`temperatureUnit`, not to plot a host series.
    () => ({
      ...computeSensorsPanelRange(),
      metrics: [formatEntityMetricId({ scope: 'host.cpu', field: 'busyPercent' })],
    }),
    { rangeKey: 'sensors-panel-host', staleTime: 30_000, refetchInterval: 60_000 }
  )
  const inventory = hostQuery.data?.inventory ?? null
  const temperatureUnit: TemperatureUnit = hostQuery.data?.temperatureUnit ?? 'celsius'
  const topologyGeneration = hostQuery.data?.topologyGeneration ?? null

  const entityMetricIds = useMemo(() => {
    if (!inventory) return []
    const ids: string[] = []
    for (const gpu of inventory.gpus) {
      for (const field of GPU_SUMMARY_FIELDS) {
        ids.push(formatEntityMetricId({ scope: 'gpu', entityId: gpu.gpuId, field }))
      }
    }
    for (const signal of inventory.hardwareSignals) {
      for (const field of HARDWARE_SIGNAL_SUMMARY_FIELDS) {
        ids.push(
          formatEntityMetricId({ scope: 'hardwareSignal', entityId: signal.signalId, field })
        )
      }
    }
    return ids
  }, [inventory])

  const entityQuery = useServerMetricsSeries(
    orgId,
    server.id,
    () => ({ ...computeSensorsPanelRange(), metrics: entityMetricIds }),
    {
      enabled: entityMetricIds.length > 0,
      rangeKey: `sensors-panel-entities:${topologyGeneration ?? 'none'}`,
      staleTime: 30_000,
      refetchInterval: 60_000,
    }
  )

  const gpus = inventory?.gpus ?? []
  // GPU temperature/power are `hardware.physical` signals now, but `GpuRow`
  // above already shows them on the GPU's own row — listing them again under
  // "Physical signals" would show every reading twice per GPU.
  const hardwareSignals = (inventory?.hardwareSignals ?? []).filter(
    (signal) => signal.component !== 'gpu'
  )
  const entities = entityQuery.data?.entities
  const noDevices = gpus.length === 0 && hardwareSignals.length === 0

  const backendUnavailable = hostQuery.error instanceof MetricsBackendUnavailableError
  const otherError = hostQuery.isError && !backendUnavailable
  const notConfigured = hostQuery.data?.available === false
  const showEmptyState = !hostQuery.isLoading && !hostQuery.isError && !notConfigured && noDevices
  const empty = showEmptyState || hostQuery.isError || notConfigured

  return (
    <SectionPanel
      title="Physical signals & GPUs"
      hint="Latest topology-reported temperatures, power, and GPU readings"
    >
      {hostQuery.isLoading ? <Text style={panelStyles.muted}>Loading…</Text> : null}

      {backendUnavailable ? (
        <Text style={panelStyles.muted}>
          Metrics store unavailable — this summary will resume when storage is reachable.
        </Text>
      ) : null}

      {otherError ? (
        <Text style={panelStyles.error}>Failed to load physical signals and GPUs.</Text>
      ) : null}

      {!hostQuery.isError && notConfigured ? (
        <Text style={panelStyles.muted}>
          Metrics storage is not configured for this runtime yet.
        </Text>
      ) : null}

      {showEmptyState ? (
        <EmptyState
          panel
          title="No physical signals or GPUs detected"
          hint="This host hasn't reported any GPU devices or hardware sensor signals yet."
        />
      ) : null}

      {gpus.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>GPU</Text>
          {gpus.map((gpu) => (
            <GpuRow
              key={gpu.gpuId}
              gpu={gpu}
              utilizationPercent={latestEntityValue(
                entities,
                'gpu',
                gpu.gpuId,
                'utilizationPercent'
              )}
              temperatureCelsius={latestEntityValue(
                entities,
                'hardware.physical',
                gpuSignalId(gpu.gpuId, 'temperature'),
                'value'
              )}
              powerWatts={latestEntityValue(
                entities,
                'hardware.physical',
                gpuSignalId(gpu.gpuId, 'power'),
                'value'
              )}
              temperatureUnit={temperatureUnit}
            />
          ))}
        </View>
      ) : null}

      {hardwareSignals.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Physical signals</Text>
          {hardwareSignals.map((signal) => (
            <SignalRow
              key={signal.signalId}
              signal={signal}
              value={latestEntityValue(entities, 'hardware.physical', signal.signalId, 'value')}
              temperatureUnit={temperatureUnit}
            />
          ))}
        </View>
      ) : null}

      {!empty ? <Text style={styles.footnote}>See the Metrics tab for history charts.</Text> : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    color: colors.textTitle,
    fontSize: 13,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.textDim,
    fontSize: 11,
  },
  /** Copy-ready terminal command that reproduces this reading on the host. */
  rowCommand: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  rowValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  rowValue: {
    color: colors.textBody,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 15,
  },
})
