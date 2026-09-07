import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { colors, spacing } from '@/lib/theme'
import {
  clampPercent,
  finiteMetric,
  formatPercent,
  hasUsageMetrics,
  type UsageMetricInput,
} from '@/lib/server-usage'

export type ServerUsageDensity = 'list' | 'tile'

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
        style={[styles.value, tile && styles.valueTile, pending && styles.pendingValue]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

function UsagePendingPlaceholder({ density }: Readonly<{ density: ServerUsageDensity }>) {
  const trackStyle = density === 'tile' ? styles.trackTile : styles.trackList
  return (
    <View
      style={[styles.root, density === 'tile' ? styles.rootTile : styles.rootList]}
      accessibilityRole="text"
      accessibilityLabel="Awaiting usage stats. First sample incoming."
    >
      {(['CPU', 'Mem', 'Swap'] as const).map((label) => (
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
 * Compact usage cluster: three vertical columns (CPU / Mem / Swap). List
 * density stays short for table rows; tile density uses taller columns.
 * Hosts with no sample yet keep the same three tracks as ghost columns
 * (ellipsis values) so the cell does not become a boxed empty-state card.
 *
 * v3 also carried a Load column (`load1/5/15`) — the v5 daemon contract has
 * no load-average metric at all, so that column has nothing to show and was
 * dropped rather than left as a permanent placeholder.
 */
export function ServerUsageBars({
  density = 'list',
  ...metrics
}: Readonly<UsageMetricInput & { density?: ServerUsageDensity }>) {
  if (!hasUsageMetrics(metrics)) {
    return <UsagePendingPlaceholder density={density} />
  }

  const { cpuBusyPercent, memoryPercent, swapPercent } = metrics

  const usage = clampPercent(finiteMetric(cpuBusyPercent))
  const cpuLabel = formatPercent(usage)

  const memory = clampPercent(memoryPercent)
  const swap = clampPercent(swapPercent)
  const trackStyle = density === 'tile' ? styles.trackTile : styles.trackList
  const tile = density === 'tile'

  return (
    <View style={[styles.root, tile ? styles.rootTile : styles.rootList]}>
      <UsageMetricColumn
        label="CPU"
        value={cpuLabel}
        density={density}
        accessibilityLabel={`CPU ${cpuLabel}`}
        accessibilityValue={
          usage == null ? { text: 'unavailable' } : { min: 0, max: 100, now: Math.round(usage) }
        }
      >
        <SimpleColumn percent={usage} color={colors.accent} trackStyle={trackStyle} />
      </UsageMetricColumn>

      <UsageMetricColumn
        label="Mem"
        value={formatPercent(memory)}
        density={density}
        accessibilityLabel={`Memory ${formatPercent(memory)}`}
        accessibilityValue={
          memory == null ? { text: 'unavailable' } : { min: 0, max: 100, now: Math.round(memory) }
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
          swap == null ? { text: 'unavailable' } : { min: 0, max: 100, now: Math.round(swap) }
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
