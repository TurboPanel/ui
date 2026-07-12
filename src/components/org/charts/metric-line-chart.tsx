import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { colors } from '@/lib/theme'

export type MetricLineSeries = Readonly<{
  key: string
  label: string
  color: string
  points: ReadonlyArray<Readonly<{ tMs: number; value: number | null }>>
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

const PADDING = { top: 8, right: 8, bottom: 28, left: 48 }

function buildLinePath(
  points: ReadonlyArray<Readonly<{ tMs: number; value: number | null }>>,
  xScale: (tMs: number) => number,
  yScale: (value: number) => number,
): string {
  const segments: string[] = []
  let current: string[] = []

  for (const point of points) {
    if (point.value === null || point.value === undefined) {
      if (current.length > 0) {
        segments.push(current.join(' '))
        current = []
      }
      continue
    }
    const cmd = current.length === 0 ? 'M' : 'L'
    current.push(`${cmd}${xScale(point.tMs).toFixed(2)},${yScale(point.value).toFixed(2)}`)
  }

  if (current.length > 0) {
    segments.push(current.join(' '))
  }

  return segments.join(' ')
}

function buildAreaPath(
  points: ReadonlyArray<Readonly<{ tMs: number; value: number | null }>>,
  xScale: (tMs: number) => number,
  yScale: (value: number) => number,
  baselineY: number,
): string {
  const segments: string[] = []
  let current: Array<{ tMs: number; value: number }> = []

  const flush = () => {
    if (current.length === 0) return
    const lineParts = current.map((point, index) => {
      const cmd = index === 0 ? 'M' : 'L'
      return `${cmd}${xScale(point.tMs).toFixed(2)},${yScale(point.value).toFixed(2)}`
    })
    const last = current.at(-1)!
    const first = current[0]!
    segments.push([
      ...lineParts,
      `L${xScale(last.tMs).toFixed(2)},${baselineY.toFixed(2)}`,
      `L${xScale(first.tMs).toFixed(2)},${baselineY.toFixed(2)}`,
      'Z',
    ].join(' '))
    current = []
  }

  for (const point of points) {
    if (point.value === null || point.value === undefined) {
      flush()
      continue
    }
    current.push({ tMs: point.tMs, value: point.value })
  }

  flush()
  return segments.join(' ')
}

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

function niceTicks(min: number, max: number, count: number): number[] {
  const range = max - min
  if (range <= 0) return [min]

  const rawStep = range / Math.max(1, count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  let step = magnitude
  if (normalized >= 5) step = 5 * magnitude
  else if (normalized >= 2) step = 2 * magnitude

  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(v)
    if (ticks.length >= count + 2) break
  }
  return ticks.length > 0 ? ticks : [min, max]
}

export function MetricLineChart({
  series,
  xDomainMs,
  height,
  yFormat,
  yDomain,
  area = false,
  gapBands = [],
  xTickFormat,
}: MetricLineChartProps) {
  const width = 400
  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = height - PADDING.top - PADDING.bottom
  const [xMin, xMax] = xDomainMs
  const [yMin, yMax] = computeYDomain(series, yDomain)

  const xScale = (tMs: number) =>
    PADDING.left +
    ((tMs - xMin) / Math.max(1, xMax - xMin)) * chartWidth
  const yScale = (value: number) =>
    PADDING.top + chartHeight - ((value - yMin) / Math.max(1e-9, yMax - yMin)) * chartHeight

  const yTicks = niceTicks(yMin, yMax, 4)
  const xTickCount = 5
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const ratio = index / (xTickCount - 1)
    return xMin + ratio * (xMax - xMin)
  })

  const baselineY = yScale(yMin)

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {gapBands.map((band) => {
        const x1 = xScale(band.fromMs)
        const x2 = xScale(band.toMs)
        return (
          <Rect
            key={`gap-${band.fromMs}-${band.toMs}`}
            x={Math.min(x1, x2)}
            y={PADDING.top}
            width={Math.abs(x2 - x1)}
            height={chartHeight}
            fill={colors.borderMuted}
            opacity={0.35}
          />
        )
      })}

      {yTicks.map((tick) => {
        const y = yScale(tick)
        return (
          <G key={`y-${tick}`}>
            <Line
              x1={PADDING.left}
              y1={y}
              x2={width - PADDING.right}
              y2={y}
              stroke={colors.borderArea}
              strokeWidth={1}
            />
            <SvgText
              x={PADDING.left - 6}
              y={y + 4}
              fontSize={10}
              fill={colors.textDim}
              textAnchor="end"
            >
              {yFormat(tick)}
            </SvgText>
          </G>
        )
      })}

      {area && series.length === 1
        ? (() => {
            const areaPath = buildAreaPath(
              series[0]!.points,
              xScale,
              yScale,
              baselineY,
            )
            return areaPath ? (
              <Path
                d={areaPath}
                fill={series[0]!.color}
                opacity={0.15}
              />
            ) : null
          })()
        : null}

      {series.map((entry) => {
        const pathD = buildLinePath(entry.points, xScale, yScale)
        if (!pathD) return null
        return (
          <Path
            key={entry.key}
            d={pathD}
            stroke={entry.color}
            strokeWidth={2}
            fill="none"
          />
        )
      })}

      {xTicks.map((tick) => (
        <SvgText
          key={`x-${tick}`}
          x={xScale(tick)}
          y={height - 6}
          fontSize={10}
          fill={colors.textDim}
          textAnchor="middle"
        >
          {xTickFormat
            ? xTickFormat(tick)
            : new Date(tick).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
        </SvgText>
      ))}
    </Svg>
  )
}
