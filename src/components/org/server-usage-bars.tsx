import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

function clampPercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function formatPercent(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value)}%`
}

function UsageBarRow({
  label,
  percent,
  accessibilityLabel,
}: Readonly<{
  label: string
  percent: number | null
  accessibilityLabel: string
}>) {
  const widthPct = percent ?? 0
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        percent == null
          ? { text: 'unavailable' }
          : { min: 0, max: 100, now: Math.round(percent) }
      }
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            percent == null ? styles.fillEmpty : null,
            { width: `${widthPct}%` },
          ]}
        />
      </View>
      <Text style={styles.value}>{formatPercent(percent)}</Text>
    </View>
  )
}

/**
 * Compact CPU + memory/swap bars for the servers fleet table.
 * Percentages come from the fleet usage snapshot (never color-only).
 */
export function ServerUsageBars({
  cpuPercent,
  memoryPercent,
  swapPercent,
}: Readonly<{
  cpuPercent?: number | null
  memoryPercent?: number | null
  swapPercent?: number | null
}>) {
  const cpu = clampPercent(cpuPercent)
  const memory = clampPercent(memoryPercent)
  const swap = clampPercent(swapPercent)

  return (
    <View style={styles.root}>
      <UsageBarRow
        label="CPU"
        percent={cpu}
        accessibilityLabel={`CPU ${formatPercent(cpu)}`}
      />
      <UsageBarRow
        label="Mem"
        percent={memory}
        accessibilityLabel={`Memory ${formatPercent(memory)}`}
      />
      <UsageBarRow
        label="Swap"
        percent={swap}
        accessibilityLabel={`Swap ${formatPercent(swap)}`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    gap: 3,
    minWidth: 140,
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
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
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
    width: 32,
    color: colors.stdout,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'right',
  },
})
