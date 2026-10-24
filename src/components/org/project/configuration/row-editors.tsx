import { useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import { TextField } from '@/components/ui'
import { ActionButton, ChoiceCard, ChoiceGroup } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { isSecretVariableName } from '@/lib/v4/effective-config'
import {
  defaultVariableUse,
  linuxUserEdit,
  removeVariableEdit,
  variableEdit,
  variableUseFlags,
  variableUseOf,
  type VariableFacts,
  type VariableUse,
} from '@/lib/v4/config-edits'

const styles = themedStyles((p) => ({
  editor: {
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: p.sep,
    backgroundColor: p.surface2,
  },
  foot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  footStart: { marginRight: 'auto' },
  label: { ...typeStyle('bodySemibold', 'subhead'), color: p.text2 },
  hint: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

function EditorFoot({
  doneLabel,
  doneDisabled,
  onDone,
  onCancel,
  start,
  cancelLabel = 'Cancel',
}: Readonly<{
  doneLabel: string
  cancelLabel?: string
  doneDisabled: boolean
  onDone: () => void
  onCancel: () => void
  /** Shown at the start of the row, away from Done (a Remove button). */
  start?: ReactNode
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.foot}>
      {start ? <View style={s.footStart}>{start}</View> : null}
      <ActionButton label={cancelLabel} variant="quiet" size="sm" onPress={onCancel} />
      <ActionButton label={doneLabel} size="sm" onPress={onDone} disabled={doneDisabled} />
    </View>
  )
}

/** "Where is it used?": run, build and run, or build. Shared by Add and Edit. */
export function VariableUseChoice({
  use,
  onChange,
}: Readonly<{ use: VariableUse; onChange: (use: VariableUse) => void }>) {
  return (
    <ChoiceGroup label="Where is it used?">
      <ChoiceCard
        title="Run"
        body="Available while the app runs. Not used while building."
        selected={use === 'run'}
        onSelect={() => onChange('run')}
      />
      <ChoiceCard
        title="Build and run"
        body="Also available while the app builds. Names starting NEXT_PUBLIC_ start here."
        selected={use === 'both'}
        onSelect={() => onChange('both')}
      />
      <ChoiceCard
        title="Build"
        body="Only while building. The running app does not get it."
        selected={use === 'build'}
        onSelect={() => onChange('build')}
      />
    </ChoiceGroup>
  )
}

/** The words for removing a variable: it goes away, or the Base value applies again. */
function removeCopy(name: string, envName: string, inBase: boolean) {
  if (inBase) {
    return {
      button: 'Use the Base value',
      question: `Remove the ${envName} value of ${name}? The Base value applies again after you save and deploy.`,
      confirm: 'Use the Base value',
    }
  }
  return {
    button: 'Remove',
    question: `Remove ${name} from ${envName}? Apps stop getting it after you save and deploy.`,
    confirm: `Remove ${name}`,
  }
}

/** The second step of Remove: say what happens, then stage it. Nothing is saved until Save changes. */
function RemoveConfirm({
  name,
  facts,
  was,
  editing,
  onKeep,
  onClose,
}: Readonly<{
  name: string
  facts: VariableFacts
  was: string
  editing: EditingApi
  onKeep: () => void
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const copy = removeCopy(name, editing.envName, facts.inBase)
  return (
    <View style={s.editor}>
      <Text style={s.label}>{copy.question}</Text>
      <EditorFoot
        doneLabel={copy.confirm}
        doneDisabled={false}
        cancelLabel="Keep it"
        onCancel={onKeep}
        onDone={() => {
          editing.onStage(removeVariableEdit({ name, was, inBase: facts.inBase }))
          onClose()
        }}
      />
    </View>
  )
}

/** Edit one variable: its value, where it is used, or remove it. Done stages the edit; nothing is saved until Save changes. */
export function VariableEditor({
  name,
  facts,
  was,
  editing,
  onClose,
}: Readonly<{
  name: string
  facts: VariableFacts
  /** The value shown on the row now, for the pending list. */
  was: string
  editing: EditingApi
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const [draft, setDraft] = useState(facts.secret ? '' : facts.value)
  const savedUse = variableUseOf(facts)
  const [use, setUse] = useState<VariableUse>(savedUse)
  const [confirming, setConfirming] = useState(false)
  const valueChanged = facts.secret ? draft !== '' : draft !== facts.value
  const useChanged = use !== savedUse
  // A secret set only on the Base has no value to copy, so a new environment value must be typed.
  const needsValue = facts.secret && !facts.hasOwn && draft === ''
  if (confirming) {
    return (
      <RemoveConfirm
        name={name}
        facts={facts}
        was={was}
        editing={editing}
        onKeep={() => setConfirming(false)}
        onClose={onClose}
      />
    )
  }
  const removeLabel = removeCopy(name, editing.envName, facts.inBase).button
  return (
    <View style={s.editor}>
      <TextField
        label={`New value for ${name}`}
        value={draft}
        onChangeText={setDraft}
        mono
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={facts.secret}
        placeholder={facts.secret ? 'Write-only: the current value is never shown' : undefined}
        accessibilityLabel={`New value for ${name}`}
      />
      <VariableUseChoice use={use} onChange={setUse} />
      {needsValue && useChanged ? (
        <Text style={s.hint}>{`Enter a value to set ${name} for ${editing.envName}.`}</Text>
      ) : null}
      <EditorFoot
        doneLabel="Done"
        doneDisabled={(!valueChanged && !useChanged) || needsValue}
        onCancel={onClose}
        start={
          facts.hasOwn ? (
            <ActionButton
              label={removeLabel}
              variant="quiet"
              size="sm"
              accessibilityLabel={`${removeLabel}: ${name}`}
              onPress={() => setConfirming(true)}
            />
          ) : undefined
        }
        onDone={() => {
          editing.onStage(
            variableEdit({
              name,
              value: valueChanged || !facts.hasOwn ? draft : null,
              secret: facts.secret,
              ...variableUseFlags(use),
              was,
              useChanged,
            })
          )
          onClose()
        }}
      />
    </View>
  )
}

/** Add a variable: a name, a value, and where it goes. */
export function NewVariableEditor({
  editing,
  onClose,
}: Readonly<{ editing: EditingApi; onClose: () => void }>) {
  const s = styles(usePalette())
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [secret, setSecret] = useState<boolean | null>(null)
  const [chosenUse, setChosenUse] = useState<VariableUse | null>(null)
  const trimmed = name.trim()
  const use = chosenUse ?? defaultVariableUse(trimmed)
  const exists = editing.variableFacts(trimmed) !== null
  const isSecret = secret ?? isSecretVariableName(trimmed)
  return (
    <View style={s.editor}>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        mono
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="API_URL"
        accessibilityLabel="Variable name"
        error={exists ? 'This variable already exists. Edit its row instead.' : null}
      />
      <TextField
        label="Value"
        value={value}
        onChangeText={setValue}
        mono
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={isSecret}
        accessibilityLabel="Variable value"
      />
      <ChoiceGroup label="Keep the value secret?">
        <ChoiceCard
          title="Keep it secret"
          body="The value is hidden everywhere and can only be replaced."
          selected={isSecret}
          onSelect={() => setSecret(true)}
        />
        <ChoiceCard
          title="Show it"
          body="Anyone who can open this page can read it."
          selected={!isSecret}
          onSelect={() => setSecret(false)}
        />
      </ChoiceGroup>
      <VariableUseChoice use={use} onChange={setChosenUse} />
      <EditorFoot
        doneLabel="Add"
        doneDisabled={trimmed === '' || value === '' || exists}
        onCancel={onClose}
        onDone={() => {
          editing.onStage(
            variableEdit({
              name: trimmed,
              value,
              secret: isSecret,
              ...variableUseFlags(use),
              was: 'Not set',
            })
          )
          onClose()
        }}
      />
    </View>
  )
}

/** Choose the Linux user an app runs as. */
export function LinuxUserEditor({
  serviceName,
  current,
  editing,
  onClose,
}: Readonly<{
  serviceName: string
  current: string
  editing: EditingApi
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const [user, setUser] = useState(current)
  return (
    <View style={s.editor}>
      <Text style={s.label}>{`Run ${serviceName} as`}</Text>
      <ChoiceGroup label={`Run ${serviceName} as`}>
        {editing.linuxUserNames.map((name) => (
          <ChoiceCard
            key={name}
            title={name}
            selected={user === name}
            onSelect={() => setUser(name)}
          />
        ))}
      </ChoiceGroup>
      <EditorFoot
        doneLabel="Done"
        doneDisabled={user === current || user === ''}
        onCancel={onClose}
        onDone={() => {
          editing.onStage(linuxUserEdit({ serviceName, user, was: current }))
          onClose()
        }}
      />
    </View>
  )
}
