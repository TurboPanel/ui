import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/theme'

export type BadgeTone = 'ok' | 'muted' | 'danger' | 'pending' | 'info'

/**
 * Uppercase status pill. Tone is never the only cue — the label carries
 * the state in text (MASTER: no color-only status).
 */
export function Badge({
  label,
  tone = 'muted',
}: Readonly<{
  label: string
  tone?: BadgeTone
}>) {
  return (
    <View style={[styles.badge, toneStyles[tone]]}>
      <Text style={[styles.text, toneTextStyles[tone]]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
})

const toneStyles = StyleSheet.create({
  ok: { borderColor: colors.green, backgroundColor: colors.bgActive },
  muted: { borderColor: colors.borderChip, backgroundColor: colors.bgSecondary },
  danger: { borderColor: colors.error, backgroundColor: 'transparent' },
  pending: { borderColor: colors.pending, backgroundColor: 'transparent' },
  info: { borderColor: colors.blue, backgroundColor: colors.bgActiveBlue },
})

const toneTextStyles = StyleSheet.create({
  ok: { color: colors.green },
  muted: { color: colors.textMuted },
  danger: { color: colors.errorText },
  pending: { color: colors.pending },
  info: { color: colors.command },
})
