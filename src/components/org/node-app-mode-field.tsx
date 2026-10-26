import { useState } from 'react'
import { Button, ButtonRow, ModalSheet, SegmentedControl, TextField } from '@/components/ui'
import {
  MAIN_NODE_APP_MODES,
  NODE_APP_MODE_MAX_LENGTH,
  nodeAppModeProblem,
  type NodeAppMode,
} from '@/lib/compose/service-kind'

/** Value of the third option; never saved, it only opens the popup. */
const CUSTOM_OPTION = 'custom'

/** Whether a saved mode is a custom one rather than one of the two main choices. */
export function isCustomNodeAppMode(mode: NodeAppMode): boolean {
  return !MAIN_NODE_APP_MODES.includes(mode)
}

/** Longest custom value shown whole on the option; longer ones end in "…". */
const CUSTOM_LABEL_MAX_LENGTH = 16

/** A long custom value is cut short on the option so the row keeps its size. */
export function customModeLabel(mode: NodeAppMode): string {
  if (mode.length <= CUSTOM_LABEL_MAX_LENGTH) return mode
  return `${mode.slice(0, CUSTOM_LABEL_MAX_LENGTH - 1)}…`
}

function modeOptions(mode: NodeAppMode) {
  const custom = isCustomNodeAppMode(mode)
  return [
    ...MAIN_NODE_APP_MODES.map((main) => ({ value: main, label: main })),
    {
      value: CUSTOM_OPTION,
      label: custom ? customModeLabel(mode) : 'Custom…',
      accessibilityLabel: custom ? `Custom mode ${mode}, press to edit` : 'Custom…',
    },
  ]
}

/**
 * The Application mode choice: production and development as the main options,
 * plus "Custom…", which opens a small popup to type any other `NODE_ENV` value
 * (staging, test, ...). Once set, the custom value is the selected option and
 * pressing it again opens the same popup to edit it.
 */
export function NodeAppModeField({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: NodeAppMode
  onChange: (value: NodeAppMode) => void
  disabled: boolean
}>) {
  const [editing, setEditing] = useState(false)
  const custom = isCustomNodeAppMode(value)
  return (
    <>
      <SegmentedControl
        options={modeOptions(value)}
        value={custom ? CUSTOM_OPTION : value}
        onChange={(next) => {
          if (next === CUSTOM_OPTION) setEditing(true)
          else onChange(next)
        }}
        disabled={disabled}
        accessibilityLabel="Application mode"
      />
      {editing ? (
        <CustomNodeAppModeSheet
          initial={custom ? value : ''}
          onCancel={() => setEditing(false)}
          onSave={(mode) => {
            setEditing(false)
            onChange(mode)
          }}
        />
      ) : null}
    </>
  )
}

/** Mounted only while open, so each opening starts from the saved value. */
function CustomNodeAppModeSheet({
  initial,
  onCancel,
  onSave,
}: Readonly<{
  initial: string
  onCancel: () => void
  onSave: (mode: NodeAppMode) => void
}>) {
  const [draft, setDraft] = useState(initial)
  const [triedSave, setTriedSave] = useState(false)
  const problem = nodeAppModeProblem(draft)
  // Say what is wrong as soon as something is typed, or once Save was pressed.
  const shownError = triedSave || draft.trim() !== '' ? problem : null
  const submit = () => {
    setTriedSave(true)
    if (problem === null) onSave(draft.trim())
  }
  return (
    <ModalSheet
      visible
      title="Custom application mode"
      description="NODE_ENV is set to this value for the build and the running process. Most tools treat any value other than production as a development build."
      onRequestClose={onCancel}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" onPress={onCancel} />
          <Button label="Save" variant="primary" onPress={submit} />
        </ButtonRow>
      }
    >
      <TextField
        label="NODE_ENV value"
        hint={`For example staging or test. Letters, digits, dots, dashes, and underscores, up to ${NODE_APP_MODE_MAX_LENGTH} characters.`}
        value={draft}
        onChangeText={setDraft}
        error={shownError}
        placeholder="staging"
        mono
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={submit}
      />
    </ModalSheet>
  )
}
