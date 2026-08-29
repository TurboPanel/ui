import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/**
 * Standard on/off control (MASTER: never a colour-only affordance — the pill
 * always carries its state as text).
 *
 * Deliberately a labelled pill rather than React Native's `Switch`: `Switch`
 * renders as three visually unrelated controls across web, iOS and Android,
 * so a console that ships all three would drift. This renders identically
 * everywhere and still reports `accessibilityRole="switch"` to each platform's
 * accessibility layer.
 *
 * Pair with {@link SettingRow} for the labelled "setting + control" layout.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  busy = false,
  onLabel = 'On',
  offLabel = 'Off',
  accessibilityLabel,
}: Readonly<{
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  /** Shows a spinner and blocks presses while a mutation is in flight. */
  busy?: boolean
  onLabel?: string
  offLabel?: string
  accessibilityLabel?: string
}>) {
  const blocked = disabled || busy
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={blocked}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: blocked, busy }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        value ? styles.on : styles.off,
        webPointer,
        pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : (
        <Text style={[styles.text, value && styles.textOn]} numberOfLines={1}>
          {value ? onLabel : offLabel}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minWidth: 64,
    minHeight: Platform.OS === 'web' ? 40 : 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  off: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  textOn: {
    color: chrome.accent,
    fontWeight: '700',
  },
})
