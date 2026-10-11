import { useState } from 'react'
import { Text, View } from 'react-native'
import { ScopeChoice } from '@/components/org/project/configuration/scope-choice'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import { TextField } from '@/components/ui'
import { ActionButton, ChoiceCard, ChoiceGroup } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { isSecretVariableName } from '@/lib/v4/effective-config'
import {
  linuxUserEdit,
  variableEdit,
  type ConfigScope,
  type VariableFacts,
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

/** The scope cards when the person has to choose, else nothing (the decision is already made). */
function useScope(editing: EditingApi) {
  const [chosen, setChosen] = useState<ConfigScope>('environment')
  const scope = editing.scopeMode === 'choose' ? chosen : editing.scopeMode
  return { scope, setScope: setChosen, asking: editing.scopeMode === 'choose' }
}

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
  const { scope, setScope, asking } = useScope(editing)
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
      {asking ? (
        <ScopeChoice
          envName={editing.envName}
          others={editing.others}
          hasOwnChange={facts.hasOwn}
          scope={scope}
          onChange={setScope}
        />
      ) : null}
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
              scope,
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
  const { scope, setScope, asking } = useScope(editing)
  const trimmed = name.trim()
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
      {asking ? (
        <ScopeChoice
          envName={editing.envName}
          others={editing.others}
          hasOwnChange={false}
          scope={scope}
          onChange={setScope}
        />
      ) : null}
      <Text style={s.hint}>Runs in the app. It is not used while building.</Text>
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
              forBuild: false,
              forRuntime: true,
              was: 'Not set',
              scope,
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
  hasOwnChange,
  editing,
  onClose,
}: Readonly<{
  serviceName: string
  current: string
  hasOwnChange: boolean
  editing: EditingApi
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const [user, setUser] = useState(current)
  const { scope, setScope, asking } = useScope(editing)
  return (
    <View style={s.editor}>
      <Text style={s.label}>{`Run ${serviceName} as`}</Text>
      <ChoiceGroup label={`Run ${serviceName} as`}>
        {editing.linuxUserNames.map((name) => (
          <ChoiceCard key={name} title={name} selected={user === name} onSelect={() => setUser(name)} />
        ))}
      </ChoiceGroup>
      {asking ? (
        <ScopeChoice
          envName={editing.envName}
          others={editing.others}
          hasOwnChange={hasOwnChange}
          scope={scope}
          onChange={setScope}
        />
      ) : null}
      <EditorFoot
        doneLabel="Done"
        doneDisabled={user === current || user === ''}
        onCancel={onClose}
        onDone={() => {
          editing.onStage(linuxUserEdit({ serviceName, user, was: current, scope }))
          onClose()
        }}
      />
    </View>
  )
}
