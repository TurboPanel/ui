import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, InlineNotice, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { changePasswordErrorMessage, changePasswordFormProblem } from '@/lib/password-change'
import { COMPROMISED_PASSWORD_MESSAGE } from '@/lib/password-policy'
import { useChangePassword } from '@/lib/queries/auth'
import { pwnedFieldNotice } from '@/lib/pwned-check'
import { usePwnedCheck } from '@/lib/use-pwned-check'
import { spacing } from '@/lib/theme'

/**
 * Change the password while signed in: current, new, confirm. The control
 * plane checks the current password, the password rules and the breach list,
 * then signs out every other device; this device stays signed in. The browser
 * checks the new password against the breach list first, exactly like sign-up,
 * and a breached password is never sent.
 */
export function ChangePasswordPanel() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const pwned = usePwnedCheck(next)
  const notice = pwnedFieldNotice(pwned.status, COMPROMISED_PASSWORD_MESSAGE)
  const busy = verifying || change.isPending

  const edit = useCallback((setter: (value: string) => void) => {
    return (value: string) => {
      setter(value)
      setError(null)
      setDone(false)
    }
  }, [])

  const send = useCallback(() => {
    setError(null)
    change
      .run({ currentPassword: current, newPassword: next })
      .then((result) => {
        if (result.ok) {
          setCurrent('')
          setNext('')
          setConfirm('')
          setDone(true)
          return
        }
        setError(changePasswordErrorMessage(result.error ?? ''))
      })
      .catch(() => {
        // `run` folds rejections into its result shape.
      })
  }, [change, current, next])

  const onSubmit = useCallback(async () => {
    const problem = changePasswordFormProblem({ current, next, confirm })
    setDone(false)
    if (problem) {
      setError(problem)
      return
    }
    setVerifying(true)
    const decision = await pwned.gate(next).finally(() => setVerifying(false))
    if (decision === 'block') {
      setError(COMPROMISED_PASSWORD_MESSAGE)
      return
    }
    send()
  }, [confirm, current, next, pwned, send])

  return (
    <View style={styles.stack}>
      <TextField
        label="Current password"
        value={current}
        onChangeText={edit(setCurrent)}
        secureTextEntry
        autoComplete="current-password"
        autoCapitalize="none"
        editable={!busy}
      />
      <TextField
        label="New password"
        hint={notice.hint ?? 'At least 8 characters, with a number and a symbol.'}
        error={notice.error}
        onBlur={pwned.checkNow}
        value={next}
        onChangeText={edit(setNext)}
        secureTextEntry
        autoComplete="new-password"
        autoCapitalize="none"
        editable={!busy}
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={edit(setConfirm)}
        secureTextEntry
        autoComplete="new-password"
        autoCapitalize="none"
        editable={!busy}
        onSubmitEditing={onSubmit}
      />

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {done ? (
        <InlineNotice
          title="Password changed"
          body="Every other device was signed out. This one stays signed in."
        />
      ) : null}

      <ButtonRow>
        <Button
          label="Change password"
          variant="primary"
          busy={busy}
          busyLabel={verifying ? 'Checking…' : 'Changing…'}
          disabled={current.length === 0 || next.length === 0 || confirm.length === 0}
          onPress={onSubmit}
        />
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
})
