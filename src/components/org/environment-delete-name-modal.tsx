import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, ModalSheet, TextField } from '@/components/ui'
import { CopyButton } from '@/components/ui/copy-button'
import { MonoText } from '@/components/ui/mono-text'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

/** The typed text counts only when it is exactly the name, so a paste works and a near miss does not. */
export function environmentNameMatches(typed: string, name: string): boolean {
  return name.length > 0 && typed === name
}

/**
 * Asks for the environment's name before deleting one that serves a public
 * hostname. Mounted only while open, so the field starts empty every time.
 */
export function EnvironmentDeleteNameModal({
  name,
  pending,
  error,
  onCancel,
  onConfirm,
}: Readonly<{
  name: string
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (typedName: string) => void
}>) {
  const [typed, setTyped] = useState('')
  const matches = environmentNameMatches(typed, name)
  return (
    <ModalSheet
      visible
      title="Delete Environment"
      description="This environment serves a public hostname. Type its name to confirm that you want to delete it."
      onRequestClose={() => {
        if (!pending) onCancel()
      }}
      dismissLabel="Close delete environment dialog"
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" onPress={onCancel} disabled={pending} />
          <Button
            label="Delete Environment"
            variant="danger"
            busy={pending}
            busyLabel="Deleting…"
            disabled={!matches}
            onPress={() => onConfirm(typed)}
          />
        </ButtonRow>
      }
    >
      <View style={styles.nameRow}>
        <MonoText>{name}</MonoText>
        <CopyButton value={name} accessibilityLabel="Copy environment name" />
      </View>
      <TextField
        label="Environment name"
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
