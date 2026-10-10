import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { ThemeMode } from '@/lib/theme-preference'

type ThemeIconProps = Readonly<{
  size?: number
  color: string
}>

const STROKE = { strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Sun: Light. */
function SunIcon({ size = 16, color }: ThemeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} {...STROKE} />
      <Path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
        stroke={color}
        {...STROKE}
      />
    </Svg>
  )
}

/** Crescent moon: Dark. */
function MoonIcon({ size = 16, color }: ThemeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" stroke={color} {...STROKE} />
    </Svg>
  )
}

/** Screen on a stand: Match computer. */
function MonitorIcon({ size = 16, color }: ThemeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={12} rx={2} stroke={color} {...STROKE} />
      <Path d="M8.5 20h7M12 16v4" stroke={color} {...STROKE} />
    </Svg>
  )
}

export function ThemeModeIcon({
  mode,
  ...rest
}: ThemeIconProps & Readonly<{ mode: ThemeMode }>) {
  if (mode === 'light') return <SunIcon {...rest} />
  if (mode === 'dark') return <MoonIcon {...rest} />
  return <MonitorIcon {...rest} />
}
