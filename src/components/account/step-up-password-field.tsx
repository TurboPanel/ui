import { TextField } from '@/components/ui'

/**
 * Optional password confirmation for a step-up protected action.
 *
 * Every security mutation accepts a password and only *needs* one when the
 * session is older than the re-auth window, so the field is always offered and
 * never required up front — the operator types it when the control plane says
 * to, not before.
 */
export function StepUpPasswordField({
  value,
  onChangeText,
  editable = true,
  required = false,
}: Readonly<{
  value: string
  onChangeText: (next: string) => void
  editable?: boolean
  /** Set once a 403 asked for it — changes the hint from optional to required. */
  required?: boolean
}>) {
  return (
    <TextField
      label="Current password"
      hint={
        required
          ? 'Your session is older than the confirmation window — enter your password to continue.'
          : 'Only needed if your session is older than the confirmation window.'
      }
      value={value}
      onChangeText={onChangeText}
      secureTextEntry
      autoComplete="current-password"
      autoCapitalize="none"
      editable={editable}
    />
  )
}
