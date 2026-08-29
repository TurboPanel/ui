import { StyleSheet, View } from 'react-native'
import { colors } from '@/lib/theme'

export type StatusTone = 'online' | 'pending' | 'offline' | 'failed' | 'neutral'

/**
 * Geometric status dot (MASTER → Status: online filled `accent`, pending
 * `pending`, offline hollow / dim, failed `error`). Never an emoji, and never
 * the only cue — always pair it with a label, since colour alone is not an
 * affordance.
 *
 * For a server's live connection state use `ConnectionStatusDot`, which adds
 * the initializing pulse on top of these same tones.
 */
export function StatusDot({
  tone = 'neutral',
  color,
  size = 'md',
}: Readonly<{
  tone?: StatusTone
  /**
   * Fill override for screens that already resolve a colour from their own
   * status map (compose graph, managed cluster roles). Prefer `tone`.
   */
  color?: string
  /** `sm` 6px for dense table rows and chips, `md` 8px elsewhere. */
  size?: 'sm' | 'md'
}>) {
  const box = size === 'sm' ? styles.sm : styles.md
  return (
    <View
      style={[box, color ? { backgroundColor: color } : toneStyles[tone]]}
      accessibilityElementsHidden
    />
  )
}

const styles = StyleSheet.create({
  sm: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  md: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
})

const toneStyles = StyleSheet.create({
  online: {
    backgroundColor: colors.accent,
  },
  pending: {
    backgroundColor: colors.pending,
  },
  offline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  failed: {
    backgroundColor: colors.error,
  },
  neutral: {
    backgroundColor: colors.textFaint,
  },
})
