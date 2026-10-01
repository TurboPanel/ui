import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, InlineNotice, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { changePasswordErrorMessage, changePasswordFormProblem } from '@/lib/password-change'
import { useChangePassword } from '@/lib/queries/auth'
import { spacing } from '@/lib/theme'

/**
 * Change the password while signed in: current, new, confirm. The control
 * plane checks the current password, the password rules and the breach list,
 * then signs out every other device; this device stays signed in.
 */
export function ChangePasswordPanel() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const edit = useCallback((setter: (value: string) => void) => {
    return (value: string) => {
      setter(value)
      setError(null)
      setDone(false)
    }
  }, [])

  const onSubmit = useCallback(() => {
    const problem = changePasswordFormProblem({ current, next, confirm })
    setDone(false)
    if (problem) {
      setError(problem)
      return
    }
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
  }, [change, confirm, current, next])

  return (
    <View style={styles.stack}>
      <TextField
        label="Current password"
        value={current}
        onChangeText={edit(setCurrent)}
        secureTextEntry
        autoComplete="current-password"
        autoCapitalize="none"
        editable={!change.isPending}
      />
      <TextField
        label="New password"
        hint="At least 8 characters, with a number and a symbol."
        value={next}
        onChangeText={edit(setNext)}
        secureTextEntry
        autoComplete="new-password"
        autoCapitalize="none"
        editable={!change.isPending}
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={edit(setConfirm)}
        secureTextEntry
        autoComplete="new-password"
        autoCapitalize="none"
        editable={!change.isPending}
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
          busy={change.isPending}
          busyLabel="Changing…"
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
