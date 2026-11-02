import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, type ButtonSize } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { TextField } from '@/components/ui/form-field'
import { ModalSheet } from '@/components/ui/modal-sheet'
import { MonoText } from '@/components/ui/mono-text'
import { panelStyles } from '@/components/ui/panel-styles'
import { typedNameMatches } from '@/lib/confirm-name'
import { spacing } from '@/lib/theme'

const BUSY_LABELS: Readonly<Record<string, string>> = {
  Delete: 'Deleting…',
  Destroy: 'Destroying…',
  Remove: 'Removing…',
}

function busyLabel(verb: string): string {
  return BUSY_LABELS[verb] ?? 'Working…'
}

/** The help line under the field: whether the delete can be undone changes the second sentence. */
export function typeNameHelp(undoable: boolean): string {
  return undoable ? 'Type the name to confirm.' : "Type the name to confirm. This can't be undone."
}

export type TypeNameConfirmProps = Readonly<{
  /** What is deleted, in book title case: "Server", "Hosting Account". */
  thing: string
  /** The exact name to type. */
  name: string
  /** Verb for the title and button; "Delete" unless the action is a "Remove". */
  verb?: string
  /** One sentence about what goes with it, shown above the name. */
  description?: string
  /** True when the thing can be brought back, so the help line does not say it can't. */
  undoable?: boolean
  pending: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (typedName: string) => void
}>

/**
 * The one dialog for deleting a named thing: the name with a Copy button, a
 * field, and a destructive button that only works on an exact match. Mount it
 * only while open, so the field starts empty every time.
 */
export function TypeNameConfirmModal({
  thing,
  name,
  verb = 'Delete',
  description,
  undoable = false,
  pending,
  error,
  onCancel,
  onConfirm,
}: TypeNameConfirmProps) {
  const [typed, setTyped] = useState('')
  const matches = typedNameMatches(typed, name)
  const title = `${verb} ${thing}`
  return (
    <ModalSheet
      visible
      title={title}
      description={description}
      onRequestClose={() => {
        if (!pending) onCancel()
      }}
      dismissLabel={`Close ${title.toLowerCase()} dialog`}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" onPress={onCancel} disabled={pending} />
          <Button
            label={title}
            variant="danger"
            busy={pending}
            busyLabel={busyLabel(verb)}
            disabled={!matches}
            onPress={() => {
              if (matches) onConfirm(typed)
            }}
          />
        </ButtonRow>
      }
    >
      <View style={styles.nameRow}>
        <MonoText>{name}</MonoText>
        <CopyButton value={name} accessibilityLabel={`Copy ${thing.toLowerCase()} name`} />
      </View>
      <TextField
        label={`${thing} name`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[panelStyles.muted, styles.help]}>{typeNameHelp(undoable)}</Text>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </ModalSheet>
  )
}

/**
 * A danger button that opens {@link TypeNameConfirmModal}: the drop-in for a
 * `ConfirmButton` on a named thing. When `onConfirm` returns a promise the
 * dialog stays open (busy) until it settles and stays open when it resolves to
 * `false`, so the caller's error shows inside it.
 */
export function TypeNameDeleteButton({
  label,
  size = 'sm',
  disabled = false,
  busy = false,
  onConfirm,
  error,
  ...modal
}: Readonly<
  Omit<TypeNameConfirmProps, 'pending' | 'onCancel' | 'onConfirm'> & {
    /** The button that opens the dialog; defaults to the dialog title. */
    label?: string
    size?: ButtonSize
    disabled?: boolean
    busy?: boolean
    onConfirm: (typedName: string) => unknown
  }
>) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const title = `${modal.verb ?? 'Delete'} ${modal.thing}`
  const confirm = (typed: string) => {
    const outcome = onConfirm(typed)
    if (!(outcome instanceof Promise)) {
      setOpen(false)
      return
    }
    setRunning(true)
    outcome.then(
      (value) => {
        setRunning(false)
        if (value !== false) setOpen(false)
      },
      () => setRunning(false)
    )
  }
  return (
    <>
      <Button
        label={label ?? title}
        variant="danger"
        size={size}
        busy={busy}
        disabled={disabled || busy}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <TypeNameConfirmModal
          {...modal}
          pending={running || busy}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={confirm}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  help: { marginTop: spacing.xs },
})
