import { useCallback, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { LineChart } from 'react-native-gifted-charts'
import { colors, spacing } from '@/lib/theme'

export type MetricLineSeries = Readonly<{
  key: string
  label: string
  color: string
  points: readonly Readonly<{ tMs: number; value: number | null }>[]
}>

export type MetricGapBand = Readonly<{
  fromMs: number
  toMs: number
}>

type MetricLineChartProps = Readonly<{
  series: MetricLineSeries[]
  xDomainMs: readonly [number, number]
  height: number
  yFormat: (value: number) => string
  yDomain?: readonly [number, number]
  area?: boolean
  /**
   * Render multi-series data as a cumulative stacked area chart: each band's
   * visual thickness is its own value, composition sums bottom-up in series
   * order. The tooltip and legend keep per-series (non-cumulative) values.
   */
  stacked?: boolean
  gapBands?: readonly MetricGapBand[]
  xTickFormat?: (ms: number) => string
}>

const Y_AXIS_WIDTH = 52
const Y_SECTIONS = 4
const X_LABEL_COUNT = 5
const X_AXIS_LABELS_HEIGHT = 28
const X_TICK_WIDTH = 68
const X_TICK_MARK_HEIGHT = 5

type ChartPoint = Readonly<{ value: number | undefined }>

function computeYDomain(
  series: MetricLineSeries[],
  yDomain: readonly [number, number] | undefined,
): [number, number] {
  if (yDomain) return [yDomain[0], yDomain[1]]

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const entry of series) {
    for (const point of entry.points) {
      if (point.value === null || point.value === undefined) continue
      min = Math.min(min, point.value)
      max = Math.max(max, point.value)
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1]
  }
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    return [Math.max(0, min - pad), max + pad]
  }

  const pad = (max - min) * 0.08
  return [Math.max(0, min - pad), max + pad]
}

type YAxisConfig = Readonly<{
  maxValue: number
  yAxisOffset: number
  noOfSections: number
  stepValue: number
  yAxisLabelTexts: string[]
}>

function computeYAxisConfig(
  series: MetricLineSeries[],
  yDomain: readonly [number, number] | undefined,
  yFormat: (value: number) => string,
): YAxisConfig {
  const [domainMin, domainMax] = computeYDomain(series, yDomain)
  const rawRange = domainMax - domainMin
  const range = Number.isFinite(rawRange) && rawRange > 0 ? rawRange : 1
  const stepValue = range / Y_SECTIONS
  const yAxisLabelTexts = Array.from({ length: Y_SECTIONS + 1 }, (_, index) =>
    yFormat(domainMin + index * stepValue),
  )
  return {
    maxValue: range,
    yAxisOffset: domainMin,
    noOfSections: Y_SECTIONS,
    stepValue,
    yAxisLabelTexts,
  }
}

function defaultXTickLabel(tMs: number): string {
  return new Date(tMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

type XAxisTick = Readonly<{ key: string; label: string; left: number }>

function buildXAxisTicks(
  xDomainMs: readonly [number, number],
  plotWidth: number,
  xTickFormat: ((ms: number) => string) | undefined,
): XAxisTick[] {
  if (plotWidth <= 0) return []
  const format = xTickFormat ?? defaultXTickLabel
  const [startMs, endMs] = xDomainMs
  const denom = X_LABEL_COUNT - 1
  const ticks: XAxisTick[] = []
  for (let i = 0; i < X_LABEL_COUNT; i += 1) {
    const fraction = i / denom
    ticks.push({
      key: `x-${i}`,
      label: format(startMs + (endMs - startMs) * fraction),
      left: fraction * plotWidth,
    })
  }
  return ticks
}

function toChartData(points: MetricLineSeries['points']): ChartPoint[] {
  return points.map((point) => ({ value: point.value ?? undefined }))
}

/**
 * Cumulative transform for stacked rendering: series[i] plots as the sum of
 * series[0..i] at each point. A point where the series' own sample is missing
 * stays null (a gap, never zero); other series' nulls contribute nothing.
 */
function toStackedSeries(series: MetricLineSeries[]): MetricLineSeries[] {
  const pointCount = series[0]?.points.length ?? 0
  const running = new Array<number>(pointCount).fill(0)
  return series.map((entry) => ({
    ...entry,
    points: entry.points.map((point, index) => {
      if (point.value === null || point.value === undefined) {
        return { tMs: point.tMs, value: null }
      }
      running[index] = (running[index] ?? 0) + point.value
      return { tMs: point.tMs, value: running[index] }
    }),
  }))
}

/**
 * Stacked bands are area fills from each cumulative line down to the axis.
 * Painting the largest cumulative area first lets every smaller one cover
 * it, so the visible band between two lines keeps its own series color.
 */
function buildDataProps(
  isSingle: boolean,
  isStacked: boolean,
  firstSeries: MetricLineSeries | undefined,
  plotted: MetricLineSeries[],
) {
  if (isSingle) {
    return { data: firstSeries ? toChartData(firstSeries.points) : [] }
  }
  const ordered = isStacked ? [...plotted].reverse() : plotted
  return {
    dataSet: ordered.map((entry) => ({
      data: toChartData(entry.points),
      color: entry.color,
      thickness: isStacked ? 1 : 2,
      hideDataPoints: true,
      ...(isStacked
        ? {
            areaChart: true,
            startFillColor: entry.color,
            endFillColor: entry.color,
            startOpacity: 0.9,
            endOpacity: 0.9,
          }
        : {}),
    })),
  }
}

function gapBandLayout(
  band: MetricGapBand,
  xDomainMs: readonly [number, number],
  plotWidth: number,
): { left: number; width: number } | null {
  const [startMs, endMs] = xDomainMs
  const domain = endMs - startMs
  if (domain <= 0 || plotWidth <= 0) return null

  const rawLeft = ((band.fromMs - startMs) / domain) * plotWidth
  const rawRight = ((band.toMs - startMs) / domain) * plotWidth
  const left = Math.max(0, Math.min(plotWidth, rawLeft))
  const right = Math.max(0, Math.min(plotWidth, rawRight))
  const width = right - left
  if (width <= 0) return null
  return { left, width }
}

const pointerStyles = StyleSheet.create({
  card: {
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.4)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },
  label: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  value: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
})

function PointerRow({
  label,
  color,
  text,
}: Readonly<{ label: string; color: string; text: string }>) {
  return (
    <View style={pointerStyles.row}>
      <View style={[pointerStyles.swatch, { backgroundColor: color }]} />
      <Text style={pointerStyles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[pointerStyles.value, { color }]}>{text}</Text>
    </View>
  )
}

function buildPointerConfig(
  legend: readonly Readonly<{ key: string; label: string; color: string }>[],
  yFormat: (value: number) => string,
  /**
   * When set (stacked mode), the tooltip reads per-series values from these
   * source series at the pointed index — the chart's own items carry the
   * cumulative values, which must never be shown.
   */
  sourceSeries?: MetricLineSeries[],
) {
  const pointerLabelComponent = sourceSeries
    ? (
        _items: unknown,
        _secondaryItems: unknown,
        pointerIndex: number,
      ) => (
        <View style={pointerStyles.card}>
          {sourceSeries.map((entry) => {
            const value = entry.points[pointerIndex]?.value
            if (value === undefined || value === null) return null
            return (
              <PointerRow
                key={entry.key}
                label={entry.label}
                color={entry.color}
                text={yFormat(value)}
              />
            )
          })}
        </View>
      )
    : (items: readonly ({ value?: number } | undefined)[]) => (
        <View style={pointerStyles.card}>
          {items.map((item, index) => {
            const value = item?.value
            if (value === undefined || value === null) return null
            const entry = legend[index]
            return (
              <PointerRow
                key={entry?.key ?? `series-${index}`}
                label={entry?.label ?? 'Value'}
                color={entry?.color ?? colors.textBody}
                text={yFormat(value)}
              />
            )
          })}
        </View>
      )

  return {
    pointerStripColor: colors.borderMuted,
    pointerStripWidth: 1,
    pointerStripUptoDataPoint: true,
    pointerColor: colors.accent,
    radius: 4,
    pointerLabelWidth: 120,
    autoAdjustPointerLabelPosition: true,
    pointerLabelComponent,
  }
}

export function MetricLineChart({
  series,
  xDomainMs,
  height,
  yFormat,
  yDomain,
  area = false,
  stacked = false,
  gapBands,
  xTickFormat,
}: MetricLineChartProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0)

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width)
    setMeasuredWidth((prev) => (prev === next ? prev : next))
  }, [])

  const isSingle = series.length === 1
  const isStacked = stacked && !isSingle
  const plotted = isStacked ? toStackedSeries(series) : series
  const firstSeries = series[0]
  const pointCount = firstSeries ? firstSeries.points.length : 0

  const chartWidth = Math.max(1, measuredWidth - Y_AXIS_WIDTH)
  const chartHeight = Math.max(1, height - 44)
  const spacing = Math.max(1, chartWidth / Math.max(1, pointCount - 1))

  const yAxis = computeYAxisConfig(plotted, yDomain, yFormat)
  const xAxisTicks = buildXAxisTicks(xDomainMs, chartWidth, xTickFormat)

  const dataProps = buildDataProps(isSingle, isStacked, firstSeries, plotted)

  const areaProps =
    area && isSingle && firstSeries
      ? {
          areaChart: true,
          color: firstSeries.color,
          startFillColor1: firstSeries.color,
          endFillColor1: firstSeries.color,
          startOpacity1: 0.28,
          endOpacity1: 0.02,
          gradientDirection: 'vertical',
        }
      : {}

  const singleColorProps =
    isSingle && firstSeries ? { color: firstSeries.color, thickness: 2 } : {}

  const pointerLegend = series.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }))
  const pointerConfig = buildPointerConfig(
    pointerLegend,
    yFormat,
    isStacked ? series : undefined,
  )

  return (
    <View style={{ width: '100%', height }} onLayout={handleLayout}>
      {measuredWidth > 0 ? (
        <View style={styles.chartFrame}>
          {gapBands && gapBands.length > 0 ? (
            <View
              style={[
                styles.gapLayer,
                {
                  left: Y_AXIS_WIDTH,
                  width: chartWidth,
                  height: chartHeight,
                },
              ]}
            >
              {gapBands.map((band) => {
                const layout = gapBandLayout(band, xDomainMs, chartWidth)
                if (!layout) return null
                return (
                  <View
                    key={`${band.fromMs}-${band.toMs}`}
                    style={[
                      styles.gapBand,
                      { left: layout.left, width: layout.width },
                    ]}
                  />
                )
              })}
            </View>
          ) : null}
          <LineChart
            {...dataProps}
            {...areaProps}
            {...singleColorProps}
            width={chartWidth}
            height={chartHeight}
            spacing={spacing}
            initialSpacing={0}
            endSpacing={0}
            adjustToWidth
            disableScroll
            // Cubic overshoot can make cumulative bands cross — stacked
            // charts draw straight segments.
            curved={!isStacked}
            hideDataPoints
            hideRules={false}
            rulesType="solid"
            rulesThickness={1}
            interpolateMissingValues={false}
            extrapolateMissingValues={false}
            maxValue={yAxis.maxValue}
            yAxisOffset={yAxis.yAxisOffset}
            noOfSections={yAxis.noOfSections}
            stepValue={yAxis.stepValue}
            yAxisLabelTexts={yAxis.yAxisLabelTexts}
            yAxisLabelWidth={Y_AXIS_WIDTH}
            xAxisLabelTexts={[]}
            xAxisLabelsHeight={X_AXIS_LABELS_HEIGHT}
            rulesColor={colors.borderArea}
            yAxisColor="transparent"
            xAxisColor={colors.borderMuted}
            yAxisThickness={0}
            xAxisThickness={1}
            backgroundColor="transparent"
            yAxisTextStyle={styles.yAxisText}
            pointerConfig={pointerConfig}
          />
          <View
            style={[
              styles.xAxisOverlay,
              {
                left: Y_AXIS_WIDTH,
                width: chartWidth,
                height: X_AXIS_LABELS_HEIGHT,
              },
            ]}
          >
            {xAxisTicks.map((tick) => (
              <View
                key={tick.key}
                style={[
                  styles.xAxisTick,
                  {
                    left: tick.left,
                    transform: [{ translateX: -X_TICK_WIDTH / 2 }],
                  },
                ]}
              >
                <View style={styles.xAxisTickMark} />
                <Text style={styles.xAxisTickText} numberOfLines={1}>
                  {tick.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  chartFrame: {
    width: '100%',
    position: 'relative',
  },
  gapLayer: {
    position: 'absolute',
    top: spacing.xs,
    zIndex: 0,
    pointerEvents: 'none',
  },
  gapBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(224, 179, 65, 0.14)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(224, 179, 65, 0.28)',
  },
  xAxisOverlay: {
    position: 'absolute',
    bottom: 0,
    zIndex: 1,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  xAxisTick: {
    position: 'absolute',
    top: 0,
    width: X_TICK_WIDTH,
    alignItems: 'center',
  },
  xAxisTickMark: {
    width: 1,
    height: X_TICK_MARK_HEIGHT,
    backgroundColor: colors.borderMuted,
    marginBottom: 3,
  },
  xAxisTickText: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  yAxisText: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
  },
})
