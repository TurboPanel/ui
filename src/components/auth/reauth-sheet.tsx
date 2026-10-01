import { useCallback, useEffect, useState } from 'react'
import { Text } from 'react-native'
import { Button, ButtonRow, InlineNotice, ModalSheet, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { submitReauth } from '@/lib/instance-api'
import {
  canSubmitStepUp,
  STEP_UP_COPY,
  STEP_UP_SIGN_IN_AGAIN_COPY,
  stepUpActionLabel,
  stepUpBroker,
  stepUpMethodToAsk,
  stepUpRequestBody,
  type StepUpChallenge,
} from '@/lib/step-up'
import { twoFactorAutoComplete, twoFactorKeyboard } from '@/lib/two-factor-prompt'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Asks the signed-in person to prove who they are again, wherever they are.
 *
 * Mounted once in `AppProviders`. It appears when a request is refused with
 * `reauth_required` (an organization turned on "ask again before permanent
 * actions"), and the request that was refused is sent again as soon as the
 * proof is accepted. Closing the sheet leaves the original refusal as the
 * result of that action.
 */
export function ReauthSheet() {
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null)

  useEffect(() => stepUpBroker.subscribe(setChallenge), [])

  const cancel = useCallback(() => stepUpBroker.settle(false), [])

  return (
    <ModalSheet
      visible={challenge !== null}
      title="Confirm it is you"
      onRequestClose={cancel}
      maxWidth={420}
    >
      {challenge ? <ReauthForm challenge={challenge} onCancel={cancel} /> : null}
    </ModalSheet>
  )
}

function ReauthForm({
  challenge,
  onCancel,
}: Readonly<{ challenge: StepUpChallenge; onCancel: () => void }>) {
  const method = stepUpMethodToAsk(challenge.methods)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    if (method === 'signin') return
    setBusy(true)
    setError(null)
    try {
      await submitReauth(stepUpRequestBody(method, value))
      stepUpBroker.settle(true)
    } catch (err) {
      setError(userErrorMessage(err, 'Could not confirm it is you. Try again.'))
      setBusy(false)
    }
  }, [method, value])

  const onSubmit = useCallback(() => {
    submit().catch(() => {
      // submit reports its own failures through setError.
    })
  }, [submit])

  const intro = `To ${stepUpActionLabel(challenge.action)}, this organization asks you to confirm it is you.`

  if (method === 'signin') {
    return (
      <>
        <Text style={panelStyles.muted}>{intro}</Text>
        <InlineNotice tone="info" title="Sign in again" body={STEP_UP_SIGN_IN_AGAIN_COPY} />
        <ButtonRow align="end">
          <Button label="Close" onPress={onCancel} />
        </ButtonRow>
      </>
    )
  }

  const copy = STEP_UP_COPY[method]
  return (
    <>
      <Text style={panelStyles.muted}>{intro}</Text>
      <TextField
        label={copy.label}
        hint={copy.prompt}
        error={error}
        value={value}
        onChangeText={(text) => {
          setValue(text)
          setError(null)
        }}
        secureTextEntry={method === 'password'}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        editable={!busy}
        autoComplete={method === 'password' ? 'current-password' : twoFactorAutoComplete('totp')}
        keyboardType={method === 'password' ? 'default' : twoFactorKeyboard('totp')}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <ButtonRow align="end">
        <Button label="Cancel" onPress={onCancel} disabled={busy} />
        <Button
          label="Confirm"
          variant="primary"
          busy={busy}
          busyLabel="Confirming…"
          disabled={!canSubmitStepUp(method, value)}
          onPress={onSubmit}
        />
      </ButtonRow>
    </>
  )
}
