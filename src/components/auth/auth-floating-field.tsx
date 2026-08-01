import { useEffect, useState } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { EyeIcon, EyeSlashIcon } from '@/components/auth/auth-eye-icons'
import {
  authFormStyles,
  authFloatingWebInputStyle,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { colors } from '@/lib/theme'

type AuthFloatingFieldProps = Readonly<{
  label: string
  value: string
  onChangeText: (text: string) => void
  accentColor: string
  editable?: boolean
  autoComplete?: NonNullable<TextInputProps['autoComplete']>
  keyboardType?: NonNullable<TextInputProps['keyboardType']>
  secureTextEntry?: boolean
  showPasswordToggle?: boolean
  passwordVisible?: boolean
  onTogglePasswordVisible?: () => void
  returnKeyType?: NonNullable<TextInputProps['returnKeyType']>
  onSubmitEditing?: NonNullable<TextInputProps['onSubmitEditing']>
}>

export function AuthFloatingField({
  label,
  value,
  onChangeText,
  accentColor,
  editable = true,
  autoComplete,
  keyboardType,
  secureTextEntry,
  showPasswordToggle = false,
  passwordVisible = false,
  onTogglePasswordVisible,
  returnKeyType,
  onSubmitEditing,
}: AuthFloatingFieldProps) {
  const [focused, setFocused] = useState(false)
  const raised = focused || value.length > 0
  const [raiseAnim] = useState(
    () => new Animated.Value(raised ? 1 : 0),
  )

  useEffect(() => {
    Animated.timing(raiseAnim, {
      toValue: raised ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start()
  }, [raiseAnim, raised])

  const labelTop = raiseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 6],
  })
  const labelFontSize = raiseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 11],
  })
  const labelColor = focused ? accentColor : colors.textLabel

  return (
    <View
      style={[
        authFormStyles.floatingField,
        focused && { borderColor: accentColor },
      ]}
    >
      <Animated.Text
        pointerEvents="none"
        // Native a11y hide; web uses aria-hidden (RN props warn on DOM).
        {...(Platform.OS === 'web'
          ? ({ 'aria-hidden': true } as const)
          : {
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
            })}
        style={[
          authFormStyles.floatingLabel,
          showPasswordToggle && authFormStyles.floatingLabelWithToggle,
          {
            top: labelTop,
            fontSize: labelFontSize,
            color: labelColor,
          },
        ]}
      >
        {label}
      </Animated.Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        secureTextEntry={secureTextEntry}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        style={[
          Platform.OS === 'web'
            ? (authFloatingWebInputStyle as unknown as TextStyle)
            : authFormStyles.floatingInputNative,
          showPasswordToggle && authFormStyles.floatingInputWithToggle,
        ]}
      />
      {showPasswordToggle ? (
        <Pressable
          onPress={onTogglePasswordVisible}
          style={[authFormStyles.passwordToggle, webPointer]}
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
          hitSlop={4}
        >
          {passwordVisible ? (
            <EyeSlashIcon color={colors.textMuted} />
          ) : (
            <EyeIcon color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}
    </View>
  )
}
