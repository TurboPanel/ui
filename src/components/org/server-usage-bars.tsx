import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { colors, spacing } from '@/lib/theme'
import {
  buildCpuStackSegments,
  clampPercent,
  CPU_IOWAIT,
  CPU_OTHER,
  CPU_SYSTEM,
  CPU_USER,
  finiteMetric,
  formatLoad,
  formatLoadPrimary,
  formatPercent,
  hasUsageMetrics,
  LOAD_FILL,
  loadPercentOfCores,
  type CpuStackSegments,
  type UsageMetricInput,
} from '@/lib/server-usage'

export type ServerUsageDensity = 'list' | 'tile'

function StackedCpuColumn({
  segments,
  trackStyle,
}: Readonly<{ segments: CpuStackSegments; trackStyle: ViewStyle }>) {
  const parts: { key: string; size: number; color: string }[] = []
  if (segments.user > 0.05) {
    parts.push({ key: 'user', size: segments.user, color: CPU_USER })
  }
  if (segments.system > 0.05) {
    parts.push({ key: 'system', size: segments.system, color: CPU_SYSTEM })
  }
  if (segments.other > 0.05) {
    parts.push({ key: 'other', size: segments.other, color: CPU_OTHER })
  }
  if (segments.iowait > 0.05) {
    parts.push({ key: 'iowait', size: segments.iowait, color: CPU_IOWAIT })
  }

  return (
    <View style={[styles.track, trackStyle]}>
      {parts.map((part) => (
        <View
          key={part.key}
          style={[
            styles.stackSeg,
            { height: `${part.size}%`, backgroundColor: part.color },
          ]}
        />
      ))}
    </View>
  )
}

function SimpleColumn({
  percent,
  color,
  trackStyle,
}: Readonly<{
  percent: number | null
  color: string
  trackStyle: ViewStyle
}>) {
  const heightPct = percent ?? 0
  return (
    <View style={[styles.track, trackStyle]}>
      <View
        style={[
          styles.fill,
          percent == null ? styles.fillEmpty : { backgroundColor: color },
          { height: `${heightPct}%` },
        ]}
      />
    </View>
  )
}

const PENDING_VALUE = '…'

function UsageMetricColumn({
  label,
  value,
  pending,
  density,
  accessibilityLabel,
  accessibilityValue,
  children,
}: Readonly<{
  label: string
  value: string
  pending?: boolean
  density: ServerUsageDensity
  accessibilityLabel: string
  accessibilityValue?: { text: string } | { min: number; max: number; now: number }
  children: ReactNode
}>) {
  const tile = density === 'tile'
  return (
    <View
      style={[styles.column, tile ? styles.columnTile : styles.columnList]}
      accessibilityRole={pending ? 'text' : 'progressbar'}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={pending ? { text: PENDING_VALUE } : accessibilityValue}
      accessibilityElementsHidden={pending === true}
    >
      <Text style={[styles.label, tile && styles.labelTile]}>{label}</Text>
      {children}
      <Text
        style={[
          styles.value,
          tile && styles.valueTile,
          pending && styles.pendingValue,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

function UsagePendingPlaceholder({
  density,
}: Readonly<{ density: ServerUsageDensity }>) {
  const trackStyle = density === 'tile' ? styles.trackTile : styles.trackList
  return (
    <View
      style={[styles.root, density === 'tile' ? styles.rootTile : styles.rootList]}
      accessibilityRole="text"
      accessibilityLabel="Awaiting usage stats. First sample incoming."
    >
      {(['CPU', 'Load', 'Mem', 'Swap'] as const).map((label) => (
        <UsageMetricColumn
          key={label}
          label={label}
          value={PENDING_VALUE}
          pending
          density={density}
          accessibilityLabel={label}
        >
          <View style={[styles.track, trackStyle]} />
        </UsageMetricColumn>
      ))}
    </View>
  )
}

/**
 * Compact usage cluster: four vertical columns (CPU / Load / Mem / Swap).
 * List density stays short for table rows; tile density uses taller columns.
 * Hosts with no sample yet keep the same four tracks as ghost columns
 * (ellipsis values) so the cell does not become a boxed empty-state card.
 */
export function ServerUsageBars({
  cpuCores,
  density = 'list',
  ...metrics
}: Readonly<
  UsageMetricInput & {
    cpuCores?: number | null
    density?: ServerUsageDensity
  }
>) {
  if (!hasUsageMetrics(metrics)) {
    return <UsagePendingPlaceholder density={density} />
  }

  const {
    cpuUsagePercent,
    cpuUserPercent,
    cpuSystemPercent,
    cpuIowaitPercent,
    load1,
    load5,
    load15,
    memoryPercent,
    swapPercent,
  } = metrics

  const stack = buildCpuStackSegments({
    usage: cpuUsagePercent,
    user: cpuUserPercent,
    system: cpuSystemPercent,
    iowait: cpuIowaitPercent,
  })
  const usage = clampPercent(cpuUsagePercent)
  const cpuLabel = formatPercent(usage)

  const load1n = finiteMetric(load1)
  const load5n = finiteMetric(load5)
  const load15n = finiteMetric(load15)
  const loadBar = loadPercentOfCores(load1n, cpuCores)
  const loadTriplet = formatLoadPrimary(load1n, load5n, load15n)
  const loadValue = formatLoad(load1n)

  const memory = clampPercent(memoryPercent)
  const swap = clampPercent(swapPercent)
  const trackStyle = density === 'tile' ? styles.trackTile : styles.trackList
  const tile = density === 'tile'

  const cpuA11y = stack
    ? `CPU ${cpuLabel}: user ${formatPercent(stack.user)}, system ${formatPercent(stack.system)}, other ${formatPercent(stack.other)}, iowait ${formatPercent(stack.iowait)}`
    : `CPU ${cpuLabel}`
  const loadA11y =
    loadBar == null
      ? `Load ${loadTriplet}`
      : `Load ${loadTriplet}, ${Math.round(loadBar)} percent of ${cpuCores} CPUs`

  return (
    <View style={[styles.root, tile ? styles.rootTile : styles.rootList]}>
      <UsageMetricColumn
        label="CPU"
        value={cpuLabel}
        density={density}
        accessibilityLabel={cpuA11y}
        accessibilityValue={
          usage == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(usage) }
        }
      >
        {stack ? (
          <StackedCpuColumn segments={stack} trackStyle={trackStyle} />
        ) : (
          <SimpleColumn percent={usage} color={colors.accent} trackStyle={trackStyle} />
        )}
      </UsageMetricColumn>

      <UsageMetricColumn
        label="Load"
        value={loadValue}
        density={density}
        accessibilityLabel={loadA11y}
        accessibilityValue={
          loadBar == null
            ? { text: loadTriplet }
            : { min: 0, max: 100, now: Math.round(loadBar) }
        }
      >
        <SimpleColumn
          percent={loadBar ?? (load1n == null ? null : 0)}
          color={LOAD_FILL}
          trackStyle={trackStyle}
        />
      </UsageMetricColumn>

      <UsageMetricColumn
        label="Mem"
        value={formatPercent(memory)}
        density={density}
        accessibilityLabel={`Memory ${formatPercent(memory)}`}
        accessibilityValue={
          memory == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(memory) }
        }
      >
        <SimpleColumn percent={memory} color={colors.command} trackStyle={trackStyle} />
      </UsageMetricColumn>

      <UsageMetricColumn
        label="Swap"
        value={formatPercent(swap)}
        density={density}
        accessibilityLabel={`Swap ${formatPercent(swap)}`}
        accessibilityValue={
          swap == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(swap) }
        }
      >
        <SimpleColumn percent={swap} color={colors.textChip} trackStyle={trackStyle} />
      </UsageMetricColumn>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rootList: {
    alignSelf: 'flex-start',
    gap: 6,
  },
  rootTile: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  column: {
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  columnList: {
    width: 32,
  },
  columnTile: {
    flex: 1,
  },
  label: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 11,
  },
  labelTile: {
    fontSize: 10,
    lineHeight: 12,
  },
  track: {
    borderRadius: 3,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    flexDirection: 'column-reverse',
    justifyContent: 'flex-start',
  },
  trackList: {
    width: 12,
    height: 22,
  },
  trackTile: {
    width: 18,
    height: 64,
    borderRadius: 4,
  },
  stackSeg: {
    width: '100%',
  },
  fill: {
    width: '100%',
    backgroundColor: colors.accent,
  },
  fillEmpty: {
    backgroundColor: colors.borderMuted,
  },
  value: {
    color: colors.stdout,
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
    alignSelf: 'stretch',
  },
  valueTile: {
    fontSize: 11,
    lineHeight: 14,
  },
  pendingValue: {
    color: colors.textMuted,
  },
})
