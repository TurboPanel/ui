import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { NavIconProps } from '@/components/icons/nav-icons'
import type { PageWidthMode } from '@/lib/page-width'

const STROKE = { strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Shield with a tick: Security. */
export function SecurityMenuIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5.1 7.5-9.5V6L12 3Z" stroke={color} {...STROKE} />
      <Path d="m9 12 2.2 2.2L15.2 10" stroke={color} {...STROKE} />
    </Svg>
  )
}

/** Circle with an i: About. */
export function AboutMenuIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} {...STROKE} />
      <Path d="M12 11v5.5" stroke={color} {...STROKE} />
      <Path d="M12 7.75h.008" stroke={color} {...STROKE} strokeWidth={2} />
    </Svg>
  )
}

/** Door with an arrow out: Sign out. */
export function SignOutMenuIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5" stroke={color} {...STROKE} />
      <Path d="M15 8l4 4-4 4M19 12H9.5" stroke={color} {...STROKE} />
    </Svg>
  )
}

/** Two sliders: UI settings. */
export function SlidersMenuIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke={color} {...STROKE} />
      <Circle cx={16} cy={7} r={2} stroke={color} {...STROKE} />
      <Circle cx={10} cy={17} r={2} stroke={color} {...STROKE} />
    </Svg>
  )
}

const LAYOUT_COLUMN_X: Readonly<Record<PageWidthMode, { x: number; width: number }>> = {
  left: { x: 5.5, width: 6.5 },
  center: { x: 8.75, width: 6.5 },
  wide: { x: 5.5, width: 13 },
}

/** Page outline with a column placed left, centred or full width: Page layout. */
export function PageLayoutIcon({
  mode,
  size = 16,
  color,
}: NavIconProps & Readonly<{ mode: PageWidthMode }>) {
  const column = LAYOUT_COLUMN_X[mode]
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4.5} width={18} height={15} rx={2.5} stroke={color} {...STROKE} strokeWidth={1.7} />
      <Rect x={column.x} y={8} width={column.width} height={8} rx={1} stroke={color} {...STROKE} strokeWidth={1.7} />
    </Svg>
  )
}
