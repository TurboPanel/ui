import { useState } from 'react'
import { View } from 'react-native'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPasswordMeter, type PasswordMeterStatus } from '@/components/auth/auth-password-meter'
import { authFormStyles } from '@/components/auth/auth-form-styles'
import { passwordProgress, type PasswordValidation } from '@/lib/password-policy'

/**
 * A new-password field with its show/hide toggle and strength meter — the
 * same control on sign-up and on the reset-password page.
 */
export function AuthNewPasswordField({
  label,
  value,
  onChangeText,
  onBlur,
  onSubmit,
  editable,
  accentColor,
  validation,
  meterStatus,
  meterHint,
  spaced = false,
}: Readonly<{
  label: string
  value: string
  onChangeText: (text: string) => void
  onBlur?: () => void
  /** Keyboard "go"; failures are reported by the caller. */
  onSubmit: () => Promise<void>
  editable: boolean
  accentColor: string
  validation: PasswordValidation
  meterStatus: PasswordMeterStatus
  meterHint: string
  /** Extra top spacing when the field follows another field. */
  spaced?: boolean
}>) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <View style={spaced ? [authFormStyles.field, authFormStyles.fieldSpaced] : authFormStyles.field}>
        <AuthFloatingField
          label={label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          accentColor={accentColor}
          autoComplete="new-password"
          secureTextEntry={!visible}
          showPasswordToggle
          passwordVisible={visible}
          onTogglePasswordVisible={() => setVisible((v) => !v)}
          editable={editable}
          returnKeyType="go"
          onSubmitEditing={() => {
            onSubmit().catch(() => {
              // Errors are surfaced by the caller's submit handler.
            })
          }}
        />
      </View>
      {value ? (
        <AuthPasswordMeter
          status={meterStatus}
          progress={passwordProgress(validation)}
          hint={meterHint}
          accentColor={accentColor}
        />
      ) : null}
    </>
  )
}
