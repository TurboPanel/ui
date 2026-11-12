import type { ReactElement } from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { IconKey } from '@/lib/icons'

type Shape =
  | Readonly<{ path: string }>
  | Readonly<{ circle: Readonly<{ cx: number; cy: number; r: number }> }>
  | Readonly<{
      rect: Readonly<{ x: number; y: number; width: number; height: number; rx: number }>
    }>

/**
 * The twelve icon keys a project or organization can pick, on a 24 viewbox
 * (the approved layout's shapes). Drawn stroke-only at 1.75 with round caps,
 * the same weight as `nav-icons.tsx`.
 */
const SHAPES: Readonly<Record<IconKey, readonly Shape[]>> = {
  cube: [
    {
      path: 'M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    },
  ],
  globe: [
    { circle: { cx: 12, cy: 12, r: 9 } },
    {
      path: 'M3.6 9h16.8M3.6 15h16.8M12 3c2.4 2.7 3.6 5.7 3.6 9s-1.2 6.3-3.6 9c-2.4-2.7-3.6-5.7-3.6-9S9.6 5.7 12 3Z',
    },
  ],
  cart: [
    { circle: { cx: 9, cy: 20, r: 1.3 } },
    { circle: { cx: 18, cy: 20, r: 1.3 } },
    { path: 'M2.5 3.5h2.6l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6' },
  ],
  bolt: [{ path: 'M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8Z' }],
  chat: [{ path: 'M20.5 12a8 8 0 0 1-11.6 7.1L3.5 20.5l1.4-4.9A8 8 0 1 1 20.5 12Z' }],
  chart: [{ path: 'M3 20.5h18M6 17v-6M11 17V6M16 17v-9' }],
  code: [{ path: 'm8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14' }],
  book: [
    { path: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5v-14Z' },
    { path: 'M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3' },
  ],
  layers: [{ path: 'm12 3 9 5-9 5-9-5 9-5Z' }, { path: 'm3 13 9 5 9-5' }],
  mail: [
    { rect: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
    { path: 'm3.5 6.5 8.5 6.5 8.5-6.5' },
  ],
  rocket: [
    { path: 'M12 15c-2-1-3-2-4-4 1.5-4.5 4.5-7.5 11-8-.5 6.5-3.5 9.5-7 12Z' },
    { path: 'M8 11H4.5L7 7.5h4M13 16v3.5l3.5-2.5V13' },
    { circle: { cx: 14.5, cy: 9.5, r: 1.3 } },
  ],
  image: [
    { rect: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
    { circle: { cx: 9, cy: 9.5, r: 1.8 } },
    { path: 'm21 16-5-5-9 9' },
  ],
}

function shapeElement(shape: Shape, color: string): ReactElement {
  const key = JSON.stringify(shape)
  const stroke = {
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
  if ('circle' in shape) return <Circle key={key} {...shape.circle} {...stroke} />
  if ('rect' in shape) return <Rect key={key} {...shape.rect} {...stroke} />
  return <Path key={key} d={shape.path} {...stroke} />
}

/** One icon key's glyph. */
export function IconKeyGlyph({
  iconKey,
  size = 16,
  color,
}: Readonly<{ iconKey: IconKey; size?: number; color: string }>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {SHAPES[iconKey].map((shape) => shapeElement(shape, color))}
    </Svg>
  )
}
