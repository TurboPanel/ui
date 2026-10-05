import Svg, { Circle, Path, Rect } from 'react-native-svg'
import {
  GLYPH_CENTER,
  GLYPHS,
  rectGeometry,
  type GlyphKey,
  type GlyphShape,
} from '@/lib/v4/status-vocab'

/** A key from what the shape is; no two shapes of one glyph share it. */
function shapeKey(shape: GlyphShape): string {
  if (shape.kind === 'path') return `path:${shape.d}`
  return shape.kind === 'circle' ? `circle:${shape.r}:${shape.paint}` : `rect:${shape.rx}`
}

function shapePaint(shape: GlyphShape, color: string) {
  if (shape.paint === 'fill') return { fill: color }
  return {
    fill: 'none',
    stroke: color,
    strokeWidth: shape.width,
    strokeLinecap: shape.round ? ('round' as const) : undefined,
    strokeLinejoin: shape.round ? ('round' as const) : undefined,
    strokeDasharray: shape.dash,
  }
}

function Shape({
  shape,
  glyph,
  color,
}: Readonly<{ shape: GlyphShape; glyph: GlyphKey; color: string }>) {
  const paint = shapePaint(shape, color)
  if (shape.kind === 'circle') {
    return <Circle cx={GLYPH_CENTER} cy={GLYPH_CENTER} r={shape.r} {...paint} />
  }
  if (shape.kind === 'path') return <Path d={shape.d} {...paint} />
  const { x, y, w, h } = rectGeometry(glyph)
  return <Rect x={x} y={y} width={w} height={h} rx={shape.rx} {...paint} />
}

/**
 * The shape half of a status: a small drawn mark in the tone colour. It is
 * decoration (the word beside it carries the meaning), so it is hidden from
 * screen readers.
 */
export function StatusGlyph({
  glyph,
  color,
  size = 10,
}: Readonly<{ glyph: GlyphKey; color: string; size?: number }>) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {GLYPHS[glyph].map((shape) => (
        <Shape key={shapeKey(shape)} shape={shape} glyph={glyph} color={color} />
      ))}
    </Svg>
  )
}
