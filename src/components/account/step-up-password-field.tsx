import { TextField } from '@/components/ui'

/**
 * Password confirmation for a step-up protected action.
 *
 * The control plane's rule (`reauth.ts`): an account that has a password must
 * resubmit it for every security mutation — a fresh session never substitutes.
 * Only an account with no password (passkey / provider sign-in only) is let
 * through on a session younger than the re-auth window. The field is always
 * offered; the hint says which case the reader is in as plainly as it can
 * without knowing the account shape, and turns firm once a 403 asked.
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
          ? 'Enter your password to continue.'
          : 'Confirm with your password. Only an account that signs in without one (passkey or provider only) may skip this for 15 minutes after signing in.'
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
