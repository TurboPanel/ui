import { type ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { webPointer } from '@/components/org/org-panel-styles'
import { chrome, colors } from '@/lib/theme'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

/**
 * Standard console button (MASTER: radius 8, weight 600, min height 40 web /
 * 44 native, 150ms press feedback, never color-only affordance).
 * `busy` disables the press and shows a spinner beside the label.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  busy = false,
  busyLabel,
  disabled = false,
  icon,
  accessibilityLabel,
}: Readonly<{
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  /** Label shown while `busy` (e.g. "Saving…"); defaults to `label`. */
  busyLabel?: string
  disabled?: boolean
  /** Optional leading SVG icon (never emoji). */
  icon?: ReactNode
  accessibilityLabel?: string
}>) {
  const blocked = disabled || busy
  const shownLabel = busy && busyLabel ? busyLabel : label
  const spinnerColor =
    variant === 'primary' ? chrome.onAccent : colors.textMuted
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy }}
      hitSlop={size === 'sm' ? 6 : undefined}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        size === 'sm' && styles.sm,
        webPointer,
        pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
      <Text
        style={[
          styles.text,
          variantTextStyles[variant],
          size === 'sm' && styles.textSm,
        ]}
        numberOfLines={1}
      >
        {shownLabel}
      </Text>
    </Pressable>
  )
}

/** Horizontal row for grouping buttons with standard gap + wrap. */
export function ButtonRow({
  align = 'start',
  children,
}: Readonly<{
  /** `end` right-aligns the row (dialog / panel footers). */
  align?: 'start' | 'end'
  children: ReactNode
}>) {
  return (
    <View style={[styles.row, align === 'end' && styles.rowEnd]}>
      {children}
    </View>
  )
}

const minHeight = Platform.OS === 'web' ? 40 : 44

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sm: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
})

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: chrome.accent,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  danger: {
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
})

const variantTextStyles = StyleSheet.create({
  primary: {
    color: chrome.onAccent,
    fontWeight: '700',
  },
  secondary: {
    color: colors.textChip,
  },
  danger: {
    color: colors.errorText,
  },
  ghost: {
    color: colors.textMuted,
  },
})
