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
  /** Dashed horizontal reference line (e.g. Tjmax/TDP limit) at a fixed Y value. */
  referenceLine?: Readonly<{ valueY: number; label: string; color?: string }>
  /**
   * Vertical dividers marking hardware-profile generation boundaries —
   * distinct from gap bands (missing samples vs. a sensor-identity change).
   */
  breakLines?: readonly number[]
}>

const Y_AXIS_WIDTH = 52
const Y_SECTIONS = 4
const X_LABEL_COUNT = 5
// Matches the gap-band layer's `top: spacing.xs` (accounts for `plotFrame`'s
// paddingTop) — captured at module scope because the component below shadows
// the `spacing` import with a local pixel-spacing variable of the same name.
const PLOT_TOP_OFFSET = spacing.xs
const X_AXIS_LABELS_HEIGHT = 28
const X_TICK_WIDTH = 68
const X_TICK_MARK_HEIGHT = 5

type ChartPoint = Readonly<{ value: number | undefined }>

function computeSeriesExtent(series: MetricLineSeries[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const entry of series) {
    for (const point of entry.points) {
      if (point.value === null || point.value === undefined) continue
      min = Math.min(min, point.value)
      max = Math.max(max, point.value)
    }
  }

  return { min, max }
}

/**
 * Folds the reference line into the extent so a limit above the plotted
 * data (e.g. Tjmax on a cool CPU) still renders on-chart.
 */
function foldReferenceIntoExtent(
  min: number,
  max: number,
  referenceValueY: number | undefined,
): { min: number; max: number } {
  if (referenceValueY === undefined || !Number.isFinite(referenceValueY)) {
    return { min, max }
  }
  return {
    min: Number.isFinite(min) ? Math.min(min, referenceValueY) : referenceValueY,
    max: Number.isFinite(max) ? Math.max(max, referenceValueY) : referenceValueY,
  }
}

function padDomain(min: number, max: number): [number, number] {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    return [Math.max(0, min - pad), max + pad]
  }
  const pad = (max - min) * 0.08
  return [Math.max(0, min - pad), max + pad]
}

function computeYDomain(
  series: MetricLineSeries[],
  yDomain: readonly [number, number] | undefined,
  referenceValueY: number | undefined,
): [number, number] {
  if (yDomain) return [yDomain[0], yDomain[1]]

  const extent = computeSeriesExtent(series)
  const { min, max } = foldReferenceIntoExtent(extent.min, extent.max, referenceValueY)

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1]
  }
  return padDomain(min, max)
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
  referenceValueY: number | undefined,
): YAxisConfig {
  const [domainMin, domainMax] = computeYDomain(series, yDomain, referenceValueY)
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

/** Pixel offset from the top of the plot area for a value on the Y axis. */
function referenceLineTop(valueY: number, yAxis: YAxisConfig, chartHeight: number): number | null {
  if (yAxis.maxValue <= 0) return null
  const domainMin = yAxis.yAxisOffset
  const domainMax = yAxis.yAxisOffset + yAxis.maxValue
  const clamped = Math.max(domainMin, Math.min(domainMax, valueY))
  const fraction = (clamped - domainMin) / yAxis.maxValue
  return chartHeight * (1 - fraction)
}

/** Same X-position math as {@link gapBandLayout}, for a single timestamp. */
function breakLineLeft(
  tMs: number,
  xDomainMs: readonly [number, number],
  plotWidth: number,
): number | null {
  const [startMs, endMs] = xDomainMs
  const domain = endMs - startMs
  if (domain <= 0 || plotWidth <= 0) return null
  const raw = ((tMs - startMs) / domain) * plotWidth
  if (raw < 0 || raw > plotWidth) return null
  return raw
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

function GapBandsLayer({
  gapBands,
  xDomainMs,
  chartWidth,
  chartHeight,
}: Readonly<{
  gapBands: readonly MetricGapBand[] | undefined
  xDomainMs: readonly [number, number]
  chartWidth: number
  chartHeight: number
}>) {
  if (!gapBands || gapBands.length === 0) return null
  return (
    <View
      style={[
        styles.gapLayer,
        { left: Y_AXIS_WIDTH, width: chartWidth, height: chartHeight },
      ]}
    >
      {gapBands.map((band) => {
        const layout = gapBandLayout(band, xDomainMs, chartWidth)
        if (!layout) return null
        return (
          <View
            key={`${band.fromMs}-${band.toMs}`}
            style={[styles.gapBand, { left: layout.left, width: layout.width }]}
          />
        )
      })}
    </View>
  )
}

function BreakLinesLayer({
  breakLines,
  xDomainMs,
  chartWidth,
  chartHeight,
}: Readonly<{
  breakLines: readonly number[] | undefined
  xDomainMs: readonly [number, number]
  chartWidth: number
  chartHeight: number
}>) {
  if (!breakLines || breakLines.length === 0) return null
  return (
    <View
      style={[
        styles.gapLayer,
        { left: Y_AXIS_WIDTH, width: chartWidth, height: chartHeight },
      ]}
    >
      {breakLines.map((tMs) => {
        const left = breakLineLeft(tMs, xDomainMs, chartWidth)
        if (left === null) return null
        return (
          <View key={tMs} style={[styles.breakLine, { left }]}>
            <Text style={styles.breakLineLabel} numberOfLines={1}>
              Hardware change
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function ReferenceLineOverlay({
  referenceLine,
  topPx,
  chartWidth,
}: Readonly<{
  referenceLine: MetricLineChartProps['referenceLine']
  topPx: number | null
  chartWidth: number
}>) {
  if (!referenceLine || topPx === null) return null
  const color = referenceLine.color ?? colors.pending
  return (
    <View
      style={[
        styles.referenceLineLayer,
        { left: Y_AXIS_WIDTH, width: chartWidth, top: PLOT_TOP_OFFSET + topPx },
      ]}
    >
      <View style={[styles.referenceLine, { backgroundColor: color }]} />
      <Text style={[styles.referenceLineLabel, { color }]} numberOfLines={1}>
        {referenceLine.label}
      </Text>
    </View>
  )
}

function XAxisTicksOverlay({
  ticks,
  chartWidth,
}: Readonly<{ ticks: XAxisTick[]; chartWidth: number }>) {
  return (
    <View
      style={[
        styles.xAxisOverlay,
        { left: Y_AXIS_WIDTH, width: chartWidth, height: X_AXIS_LABELS_HEIGHT },
      ]}
    >
      {ticks.map((tick) => (
        <View
          key={tick.key}
          style={[
            styles.xAxisTick,
            { left: tick.left, transform: [{ translateX: -X_TICK_WIDTH / 2 }] },
          ]}
        >
          <View style={styles.xAxisTickMark} />
          <Text style={styles.xAxisTickText} numberOfLines={1}>
            {tick.label}
          </Text>
        </View>
      ))}
    </View>
  )
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
  referenceLine,
  breakLines,
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

  const yAxis = computeYAxisConfig(plotted, yDomain, yFormat, referenceLine?.valueY)
  const xAxisTicks = buildXAxisTicks(xDomainMs, chartWidth, xTickFormat)
  const referenceLineTopPx =
    referenceLine !== undefined ? referenceLineTop(referenceLine.valueY, yAxis, chartHeight) : null

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
          <GapBandsLayer
            gapBands={gapBands}
            xDomainMs={xDomainMs}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
          />
          <BreakLinesLayer
            breakLines={breakLines}
            xDomainMs={xDomainMs}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
          />
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
          <ReferenceLineOverlay
            referenceLine={referenceLine}
            topPx={referenceLineTopPx}
            chartWidth={chartWidth}
          />
          <XAxisTicksOverlay ticks={xAxisTicks} chartWidth={chartWidth} />
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
  breakLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.borderMuted,
  },
  breakLineLabel: {
    position: 'absolute',
    top: -12,
    left: 3,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textDim,
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  referenceLineLayer: {
    position: 'absolute',
    zIndex: 2,
    pointerEvents: 'none',
    flexDirection: 'row',
    alignItems: 'center',
  },
  referenceLine: {
    flex: 1,
    height: 1,
    opacity: 0.7,
  },
  referenceLineLabel: {
    position: 'absolute',
    right: 0,
    top: -14,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
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
