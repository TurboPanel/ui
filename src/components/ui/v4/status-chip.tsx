import { Text, View } from 'react-native'
import { StatusGlyph } from '@/components/ui/v4/status-glyph'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { statusInfo, type StatusTone } from '@/lib/v4/status-vocab'
import { CHIP_HEIGHT, RADIUS } from '@/lib/v4/ui-scale'
import type { Palette } from '@/lib/theme-palettes'

export type StatusChipSize = 'sm' | 'md' | 'lg' | 'dot'

const GLYPH_SIZE = { sm: 8, md: 10, lg: 12, dot: 10 } as const
const FONT_SIZE = { sm: 'caption', md: 'footnote', lg: 'subhead', dot: 'footnote' } as const

/** The tone colour of a status on a palette. */
export function toneColor(p: Palette, tone: StatusTone): string {
  return p[tone]
}

const styles = themedStyles(() => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    backgroundColor: 'transparent',
  },
  sm: { minHeight: CHIP_HEIGHT.sm, paddingLeft: 6, paddingRight: 7 },
  md: { minHeight: CHIP_HEIGHT.md, paddingLeft: 7, paddingRight: 8 },
  lg: { minHeight: CHIP_HEIGHT.lg, paddingLeft: 8, paddingRight: 12 },
  dot: { alignSelf: 'center' },
}))

/**
 * A status as a station chip: a drawn mark plus the word, in a pill with a
 * 1 px border in the tone colour and no fill. Never colour alone. `dot` shows
 * the mark only and keeps the word as its accessible name.
 *
 * `status` is a key of the status vocabulary; pass `label` to say more than the
 * default word ("2 not deployed").
 */
export function StatusChip({
  status,
  label,
  size = 'md',
}: Readonly<{ status: string; label?: string; size?: StatusChipSize }>) {
  const p = usePalette()
  const s = styles(p)
  const info = statusInfo(status)
  const word = label ?? info.label
  const color = toneColor(p, info.tone)
  const glyph = <StatusGlyph glyph={info.glyph} color={color} size={GLYPH_SIZE[size]} />

  if (size === 'dot') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={word} style={s.dot}>
        {glyph}
      </View>
    )
  }
  return (
    <View
      accessible
      accessibilityLabel={word}
      style={[s.chip, s[size], { borderColor: color }]}
    >
      {glyph}
      <Text
        style={[typeStyle('bodySemibold', FONT_SIZE[size]), { color }]}
        numberOfLines={1}
      >
        {word}
      </Text>
    </View>
  )
}
