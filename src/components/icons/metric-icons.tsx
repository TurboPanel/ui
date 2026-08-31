import Svg, { Path, Rect } from 'react-native-svg'

type MetricIconProps = Readonly<{
  size?: number
  color: string
}>

/**
 * Host-metric glyphs for the server metrics overview tiles. Stroke-only at
 * 1.75 on a 24 viewbox so they sit at the same weight as the resource icons
 * in `resource-icons.tsx`.
 */

/** Chip with pins — CPU. */
export function CpuMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={6}
        y={6}
        width={12}
        height={12}
        rx={1.5}
        stroke={color}
        strokeWidth={1.75}
      />
      <Rect
        x={9.75}
        y={9.75}
        width={4.5}
        height={4.5}
        stroke={color}
        strokeWidth={1.5}
      />
      <Path
        d="M9 6V3.5M15 6V3.5M9 20.5V18M15 20.5V18M6 9H3.5M6 15H3.5M20.5 9H18M20.5 15H18"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** RAM stick — memory. */
export function MemoryMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={7}
        width={18}
        height={10}
        rx={1.5}
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M7.5 10.5v3M12 10.5v3M16.5 10.5v3M6 17v2.5M12 17v2.5M18 17v2.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Cylinder — storage volume. */
export function StorageMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19.5 6c0 1.657-3.358 3-7.5 3S4.5 7.657 4.5 6m15 0c0-1.657-3.358-3-7.5-3S4.5 4.343 4.5 6m15 0v12c0 1.657-3.358 3-7.5 3s-7.5-1.343-7.5-3V6m15 6c0 1.657-3.358 3-7.5 3s-7.5-1.343-7.5-3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Opposed arrows — network throughput. */
export function NetworkMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h13m0 0-3.5-3.5M17 9l-3.5 3.5M20 15H7m0 0 3.5-3.5M7 15l3.5 3.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Stacked bars — running processes. */
export function ProcessMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6.5h16M4 12h10M4 17.5h13"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Clock — uptime. */
export function UptimeMetricIcon({ size = 16, color }: MetricIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M12 7.5V12l3 2"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
