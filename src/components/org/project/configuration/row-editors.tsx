import { useState } from 'react'
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
  variableEdit,
  variableUseFlags,
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
  foot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  label: { ...typeStyle('bodySemibold', 'subhead'), color: p.text2 },
  hint: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

function EditorFoot({
  doneLabel,
  doneDisabled,
  onDone,
  onCancel,
}: Readonly<{
  doneLabel: string
  doneDisabled: boolean
  onDone: () => void
  onCancel: () => void
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.foot}>
      <ActionButton label="Cancel" variant="quiet" size="sm" onPress={onCancel} />
      <ActionButton label={doneLabel} size="sm" onPress={onDone} disabled={doneDisabled} />
    </View>
  )
}

/** Edit one variable's value. Done stages the edit; nothing is saved until Save changes. */
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
  const unchanged = facts.secret ? draft === '' : draft === facts.value
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
      <EditorFoot
        doneLabel="Done"
        doneDisabled={unchanged}
        onCancel={onClose}
        onDone={() => {
          editing.onStage(
            variableEdit({
              name,
              value: draft,
              secret: facts.secret,
              forBuild: facts.forBuild,
              forRuntime: facts.forRuntime,
              was,
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
  const [chosenUse, setUse] = useState<VariableUse | null>(null)
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
      <ChoiceGroup label="Where is it used?">
        <ChoiceCard
          title="Run"
          body="Available while the app runs. Not used while building."
          selected={use === 'run'}
          onSelect={() => setUse('run')}
        />
        <ChoiceCard
          title="Build and run"
          body="Also available while the app builds. Names starting NEXT_PUBLIC_ start here."
          selected={use === 'both'}
          onSelect={() => setUse('both')}
        />
        <ChoiceCard
          title="Build"
          body="Only while building. The running app does not get it."
          selected={use === 'build'}
          onSelect={() => setUse('build')}
        />
      </ChoiceGroup>
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
