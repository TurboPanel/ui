import { useCallback, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { LineChart } from 'react-native-gifted-charts'
import { colors } from '@/lib/theme'

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
  gapBands?: readonly MetricGapBand[]
  xTickFormat?: (ms: number) => string
}>

// Left gutter reserved for the Y-axis labels; matches the previous SVG left
// padding so charts keep the same visual alignment inside `ChartCard`.
const Y_AXIS_WIDTH = 48
const Y_SECTIONS = 4
const X_LABEL_COUNT = 5

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
    return [min - pad, max + pad]
  }

  const pad = (max - min) * 0.08
  return [min - pad, max + pad]
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
  // gifted-charts subtracts `yAxisOffset` from every value during data
  // sanitisation, so the axis maximum must be the shifted range rather than the
  // absolute domain maximum — otherwise charts with a non-zero lower bound
  // collapse toward the bottom.
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

function buildXAxisLabels(
  pointCount: number,
  xDomainMs: readonly [number, number],
  xTickFormat: ((ms: number) => string) | undefined,
): string[] {
  const labels = new Array<string>(pointCount).fill('')
  if (pointCount === 0) return labels

  const format = xTickFormat ?? defaultXTickLabel
  const [startMs, endMs] = xDomainMs
  const denom = X_LABEL_COUNT - 1
  for (let i = 0; i < X_LABEL_COUNT; i += 1) {
    const index =
      pointCount === 1 ? 0 : Math.round((i * (pointCount - 1)) / denom)
    const fraction = i / denom
    labels[index] = format(startMs + (endMs - startMs) * fraction)
  }
  return labels
}

function toChartData(points: MetricLineSeries['points']): ChartPoint[] {
  return points.map((point) => ({ value: point.value ?? undefined }))
}

/** Map a gap band onto the plot area (right of the Y-axis gutter). */
function gapBandLayout(
  band: MetricGapBand,
  xDomainMs: readonly [number, number],
  plotWidth: number,
): { left: number; width: number } | null {
  const [startMs, endMs] = xDomainMs
  const domain = endMs - startMs
  if (!(domain > 0) || !(plotWidth > 0)) return null

  const rawLeft = ((band.fromMs - startMs) / domain) * plotWidth
  const rawRight = ((band.toMs - startMs) / domain) * plotWidth
  const left = Math.max(0, Math.min(plotWidth, rawLeft))
  const right = Math.max(0, Math.min(plotWidth, rawRight))
  const width = right - left
  if (!(width > 0)) return null
  return { left, width }
}

const pointerStyles = StyleSheet.create({
  card: {
    minWidth: 60,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
})

function buildPointerConfig(
  legend: readonly Readonly<{ key: string; color: string }>[],
  yFormat: (value: number) => string,
) {
  return {
    pointerStripColor: colors.borderMuted,
    pointerStripWidth: 1,
    pointerColor: colors.accent,
    radius: 4,
    autoAdjustPointerLabelPosition: true,
    pointerLabelComponent: (
      items: readonly ({ value?: number } | undefined)[],
    ) => (
      <View style={pointerStyles.card}>
        {items.map((item, index) => {
          const value = item?.value
          if (value === undefined || value === null) return null
          const entry = legend[index]
          return (
            <Text
              key={entry?.key ?? entry?.color ?? 'series'}
              style={[
                pointerStyles.text,
                { color: entry?.color ?? colors.textBody },
              ]}
            >
              {yFormat(value)}
            </Text>
          )
        })}
      </View>
    ),
  }
}

export function MetricLineChart({
  series,
  xDomainMs,
  height,
  yFormat,
  yDomain,
  area = false,
  gapBands,
  xTickFormat,
}: MetricLineChartProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0)

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width)
    setMeasuredWidth((prev) => (prev === next ? prev : next))
  }, [])

  const isSingle = series.length === 1
  const firstSeries = series[0]
  const pointCount = firstSeries ? firstSeries.points.length : 0

  const chartWidth = Math.max(1, measuredWidth - Y_AXIS_WIDTH)
  const chartHeight = Math.max(1, height - 40)
  const spacing = Math.max(1, chartWidth / Math.max(1, pointCount - 1))

  const yAxis = computeYAxisConfig(series, yDomain, yFormat)
  const xAxisLabelTexts = buildXAxisLabels(pointCount, xDomainMs, xTickFormat)

  const dataProps = isSingle
    ? { data: firstSeries ? toChartData(firstSeries.points) : [] }
    : {
        dataSet: series.map((entry) => ({
          data: toChartData(entry.points),
          color: entry.color,
          thickness: 2,
          hideDataPoints: true,
        })),
      }

  const areaProps =
    area && isSingle && firstSeries
      ? {
          areaChart: true,
          color: firstSeries.color,
          startFillColor1: firstSeries.color,
          endFillColor1: firstSeries.color,
          startOpacity1: 0.15,
          endOpacity1: 0.02,
        }
      : {}

  const singleColorProps =
    isSingle && firstSeries ? { color: firstSeries.color } : {}

  return (
    <View style={{ width: '100%', height }} onLayout={handleLayout}>
      {measuredWidth > 0 ? (
        <View style={styles.chartFrame}>
          {gapBands && gapBands.length > 0 ? (
            <View
              pointerEvents="none"
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
            thickness={2}
            curved
            hideDataPoints
            interpolateMissingValues={false}
            extrapolateMissingValues={false}
            maxValue={yAxis.maxValue}
            yAxisOffset={yAxis.yAxisOffset}
            noOfSections={yAxis.noOfSections}
            stepValue={yAxis.stepValue}
            yAxisLabelTexts={yAxis.yAxisLabelTexts}
            yAxisLabelWidth={Y_AXIS_WIDTH}
            xAxisLabelTexts={xAxisLabelTexts}
            xAxisLabelsHeight={20}
            rulesColor={colors.borderArea}
            yAxisColor={colors.borderArea}
            xAxisColor={colors.borderMuted}
            yAxisThickness={1}
            xAxisThickness={1}
            backgroundColor="transparent"
            yAxisTextStyle={{ color: colors.textDim, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.textDim, fontSize: 10 }}
            pointerConfig={buildPointerConfig(
              series.map((entry) => ({ key: entry.key, color: entry.color })),
              yFormat,
            )}
          />
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
    top: 0,
    zIndex: 0,
  },
  gapBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(224, 179, 65, 0.12)',
  },
})
