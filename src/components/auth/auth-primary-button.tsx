import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { authFormStyles, webPointer } from '@/components/auth/auth-form-styles'

/**
 * Shared auth-screen CTA: tinted {@link authFormStyles.primaryButton} with the
 * standard pressed/disabled opacity states and an inline spinner while busy.
 */
export function AuthPrimaryButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  tint,
  spinnerColor,
}: Readonly<{
  /** Idle label. */
  label: string
  /** Label shown next to the spinner while busy (defaults to {@link label}). */
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onPress: () => void
  accessibilityLabel: string
  tint: Readonly<{
    primaryButton: StyleProp<ViewStyle>
    primaryButtonText: StyleProp<TextStyle>
  }>
  /** Spinner color while busy — typically the accent's on-accent color. */
  spinnerColor?: string
}>) {
  const textStyle = [authFormStyles.primaryButtonText, tint.primaryButtonText]
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        authFormStyles.primaryButton,
        tint.primaryButton,
        disabled && authFormStyles.primaryButtonDisabled,
        pressed && !disabled && authFormStyles.primaryButtonPressed,
        webPointer,
      ]}
    >
      {busy ? (
        <View style={authFormStyles.primaryButtonContent}>
          <ActivityIndicator size="small" color={spinnerColor} />
          <Text style={textStyle}>{busyLabel ?? label}</Text>
        </View>
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </Pressable>
  )
}
