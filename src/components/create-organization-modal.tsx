import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ModalSheet, TextField } from '@/components/ui'
import { foldDisplayNameApostrophes, DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from '@/lib/display-name'

type CreateOrganizationModalProps = Readonly<{
  visible: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string }>
}>

export function CreateOrganizationModal({
  visible,
  onClose,
  onCreate,
}: CreateOrganizationModalProps) {
  const [name, setName] = useState('New Organization')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName('New Organization')
    setError(null)
    setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting) {
      return
    }
    reset()
    onClose()
  }

  const handleCreate = async () => {
    const displayName = foldDisplayNameApostrophes(name).trim()
    const validationError = validateDisplayName(displayName)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)
    const result = await onCreate(name)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not create organization.')
      return
    }
    reset()
    onClose()
  }

  return (
    <ModalSheet
      visible={visible}
      onRequestClose={handleClose}
      title="Create organization"
      description="You will be the owner of the new organization and can invite others later."
      dismissLabel="Close create organization dialog"
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" onPress={handleClose} disabled={submitting} />
          <Button
            label="Create"
            variant="primary"
            busy={submitting}
            busyLabel="Creating…"
            onPress={() => {
              handleCreate().catch(() => {
                setSubmitting(false)
                setError('Could not create organization.')
              })
            }}
          />
        </ButtonRow>
      }
    >
      <TextField
        label="Organization name"
        value={name}
        onChangeText={(value) => {
          setName(value)
          if (error) {
            setError(null)
          }
        }}
        autoCapitalize="words"
        autoCorrect={false}
        editable={!submitting}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        accessibilityLabel="Organization name"
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </ModalSheet>
  )
}

