import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { IconKeyGlyph } from '@/components/icons/icon-key-glyphs'
import { resolveIcon } from '@/lib/icons'

/**
 * A project's or organization's chosen icon: a key's glyph, an emoji drawn as
 * text sized to the box, or `fallback` (the surface's own default: the cube,
 * the building). A stored emoji draws the fallback while the organization has
 * emoji icons turned off; the stored value is never changed.
 */
export function ResourceIcon({
  icon,
  isEmojiIconAllowed,
  size = 16,
  color,
  fallback,
}: Readonly<{
  icon: string | null | undefined
  isEmojiIconAllowed: boolean
  size?: number
  /** Stroke colour of a key's glyph. */
  color: string
  /** What draws when there is no icon to show. */
  fallback: ReactNode
}>) {
  const resolved = resolveIcon(icon, isEmojiIconAllowed)
  if (resolved.type === 'key') {
    return <IconKeyGlyph iconKey={resolved.key} size={size} color={color} />
  }
  if (resolved.type === 'emoji') {
    return (
      <View style={[styles.box, { width: size, height: size }]} aria-hidden>
        <Text
          style={[styles.emoji, { fontSize: Math.round(size * 0.85), lineHeight: size }]}
          allowFontScaling={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {resolved.emoji}
        </Text>
      </View>
    )
  }
  return <>{fallback}</>
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  emoji: { textAlign: 'center', includeFontPadding: false },
})
