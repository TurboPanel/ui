import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'
import {
  buildCpuStackSegments,
  clampPercent,
  CPU_IOWAIT,
  CPU_OTHER,
  CPU_SYSTEM,
  CPU_USER,
  finiteMetric,
  formatLoadPrimary,
  formatPercent,
  LOAD_FILL,
  loadPercentOfCores,
  type CpuStackSegments,
} from '@/lib/server-usage'

function StackedCpuBar({
  segments,
}: Readonly<{ segments: CpuStackSegments }>) {
  const parts: { key: string; width: number; color: string }[] = []
  if (segments.user > 0.05) {
    parts.push({ key: 'user', width: segments.user, color: CPU_USER })
  }
  if (segments.system > 0.05) {
    parts.push({ key: 'system', width: segments.system, color: CPU_SYSTEM })
  }
  if (segments.other > 0.05) {
    parts.push({ key: 'other', width: segments.other, color: CPU_OTHER })
  }
  if (segments.iowait > 0.05) {
    parts.push({ key: 'iowait', width: segments.iowait, color: CPU_IOWAIT })
  }

  return (
    <View style={styles.track}>
      {parts.map((part) => (
        <View
          key={part.key}
          style={[
            styles.stackSeg,
            { width: `${part.width}%`, backgroundColor: part.color },
          ]}
        />
      ))}
    </View>
  )
}

function SimpleBar({
  percent,
  color,
}: Readonly<{ percent: number | null; color: string }>) {
  const widthPct = percent ?? 0
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          percent == null ? styles.fillEmpty : { backgroundColor: color },
          { width: `${widthPct}%` },
        ]}
      />
    </View>
  )
}

/**
 * Compact pro usage cell: stacked CPU, load 1/5/15 (capacity-scaled bar),
 * memory and swap %.
 */
export function ServerUsageBars({
  cpuUsagePercent,
  cpuUserPercent,
  cpuSystemPercent,
  cpuIowaitPercent,
  load1,
  load5,
  load15,
  cpuCores,
  memoryPercent,
  swapPercent,
}: Readonly<{
  cpuUsagePercent?: number | null
  cpuUserPercent?: number | null
  cpuSystemPercent?: number | null
  cpuIowaitPercent?: number | null
  load1?: number | null
  load5?: number | null
  load15?: number | null
  cpuCores?: number | null
  memoryPercent?: number | null
  swapPercent?: number | null
}>) {
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
  // Bar height uses 1-minute load vs cores (when known).
  const loadBar = loadPercentOfCores(load1n, cpuCores)
  const loadLabel = formatLoadPrimary(load1n, load5n, load15n)

  const memory = clampPercent(memoryPercent)
  const swap = clampPercent(swapPercent)

  const cpuA11y = stack
    ? `CPU ${cpuLabel}: user ${formatPercent(stack.user)}, system ${formatPercent(stack.system)}, other ${formatPercent(stack.other)}, iowait ${formatPercent(stack.iowait)}`
    : `CPU ${cpuLabel}`
  const loadA11y =
    loadBar == null
      ? `Load ${loadLabel}`
      : `Load ${loadLabel}, ${Math.round(loadBar)} percent of ${cpuCores} CPUs`

  return (
    <View style={styles.root}>
      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel={cpuA11y}
        accessibilityValue={
          usage == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(usage) }
        }
      >
        <Text style={styles.label}>CPU</Text>
        {stack ? (
          <StackedCpuBar segments={stack} />
        ) : (
          <SimpleBar percent={usage} color={colors.accent} />
        )}
        <Text style={styles.value}>{cpuLabel}</Text>
      </View>

      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel={loadA11y}
        accessibilityValue={
          loadBar == null
            ? { text: loadLabel }
            : { min: 0, max: 100, now: Math.round(loadBar) }
        }
      >
        <Text style={styles.label}>Load</Text>
        <SimpleBar
          percent={loadBar ?? (load1n == null ? null : 0)}
          color={LOAD_FILL}
        />
        <Text style={[styles.value, styles.loadValue]} numberOfLines={1}>
          {loadLabel}
        </Text>
      </View>

      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel={`Memory ${formatPercent(memory)}`}
        accessibilityValue={
          memory == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(memory) }
        }
      >
        <Text style={styles.label}>Mem</Text>
        <SimpleBar percent={memory} color={colors.command} />
        <Text style={styles.value}>{formatPercent(memory)}</Text>
      </View>

      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityLabel={`Swap ${formatPercent(swap)}`}
        accessibilityValue={
          swap == null
            ? { text: 'unavailable' }
            : { min: 0, max: 100, now: Math.round(swap) }
        }
      >
        <Text style={styles.label}>Swap</Text>
        <SimpleBar percent={swap} color={colors.textChip} />
        <Text style={styles.value}>{formatPercent(swap)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    gap: 3,
    minWidth: 168,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    width: 32,
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  stackSeg: {
    height: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  fillEmpty: {
    backgroundColor: colors.borderMuted,
  },
  value: {
    width: 36,
    color: colors.stdout,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'right',
  },
  loadValue: {
    width: 78,
    fontSize: 9,
    letterSpacing: -0.2,
  },
})
