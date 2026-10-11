import { useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { TextField } from '@/components/ui'
import { ActionButton, ListGroup, ListRow, SectionHeading, Sheet } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  serverMoveCopy,
  type EnvironmentServerFacts,
  type MoveChoice,
} from '@/lib/v4/environment-settings'

const styles = themedStyles((p) => ({
  page: { gap: 32, width: '100%' },
  section: { gap: 4 },
  form: { gap: 16, maxWidth: 560 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  line: { ...typeStyle('body', 'subhead'), color: p.text2 },
}))

export type RenameFormProps = Readonly<{
  name: string
  onName: (value: string) => void
  error: string | null
  /** Save shows only when the name changed. */
  dirty: boolean
  canSave: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}>

export type EnvironmentSettingsViewProps = Readonly<{
  environmentName: string
  canEdit: boolean
  rename: RenameFormProps
  server: EnvironmentServerFacts
  /** Where it can move to (empty when no other server is connected). */
  moveChoices: readonly MoveChoice[]
  moving: boolean
  onMove: (choice: MoveChoice) => void
  /** Branch and deploy on push (the existing panel); absent when no app is bound to a repository. */
  gitSource: ReactNode | null
  /** The delete control; absent for a viewer. */
  danger: ReactNode | null
}>

function serverValue(server: EnvironmentServerFacts): string {
  if (!server.server) return 'No server yet'
  return server.offline ? `${server.server} (offline)` : server.server
}

function serverSub(server: EnvironmentServerFacts): string {
  if (server.source === 'pinned') return 'Set for this environment.'
  if (server.source === 'project') return "The project's server."
  return 'Deploy needs a connected server. Pick one below.'
}

function MoveSheet({
  environmentName,
  from,
  choice,
  busy,
  onConfirm,
  onClose,
}: Readonly<{
  environmentName: string
  from: string | null
  choice: MoveChoice | null
  busy: boolean
  onConfirm: (choice: MoveChoice) => void
  onClose: () => void
}>) {
  const s = styles(usePalette())
  if (!choice) return null
  const copy = serverMoveCopy(environmentName, from, choice)
  return (
    <Sheet
      visible
      onClose={onClose}
      title={copy.title}
      footer={
        <>
          <ActionButton label="Cancel" variant="quiet" onPress={onClose} disabled={busy} />
          <ActionButton label={copy.confirm} busy={busy} onPress={() => onConfirm(choice)} />
        </>
      }
    >
      {copy.lines.map((line) => (
        <Text key={line} style={s.line}>
          {line}
        </Text>
      ))}
    </Sheet>
  )
}

function ServerSection(props: Readonly<EnvironmentSettingsViewProps>) {
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<MoveChoice | null>(null)
  const canMove = props.canEdit && props.moveChoices.length > 0
  const close = () => setChosen(null)
  return (
    <View>
      <SectionHeading title="Server" note="Where this environment runs" />
      <ListGroup>
        <ListRow
          title="Runs on"
          sub={serverSub(props.server)}
          value={serverValue(props.server)}
          unset={!props.server.server}
          trailing={
            canMove ? (
              <ActionButton
                label={picking ? 'Hide servers' : 'Move to another server'}
                variant="secondary"
                size="sm"
                onPress={() => setPicking((value) => !value)}
              />
            ) : undefined
          }
        />
      </ListGroup>
      {picking && canMove ? (
        <ListGroup title="Move to">
          {props.moveChoices.map((choice) => (
            <ListRow
              key={choice.serverId ?? 'project'}
              title={choice.label}
              sub={choice.sub}
              onPress={() => setChosen(choice)}
              accessibilityLabel={`Move to ${choice.label}`}
            />
          ))}
        </ListGroup>
      ) : null}
      <MoveSheet
        environmentName={props.environmentName}
        from={props.server.server}
        choice={chosen}
        busy={props.moving}
        onClose={close}
        onConfirm={(choice) => {
          props.onMove(choice)
          close()
          setPicking(false)
        }}
      />
    </View>
  )
}

function RenameSection({ rename, canEdit }: Readonly<{ rename: RenameFormProps; canEdit: boolean }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <SectionHeading title="Name" />
      <View style={s.form}>
        <TextField
          label="Environment name"
          value={rename.name}
          onChangeText={rename.onName}
          error={rename.error}
          editable={canEdit}
          accessibilityLabel="Environment name"
        />
        {rename.dirty && canEdit ? (
          <View style={s.actions}>
            <ActionButton label="Save" onPress={rename.onSave} disabled={!rename.canSave} busy={rename.saving} />
            <ActionButton label="Discard" variant="quiet" onPress={rename.onReset} disabled={rename.saving} />
          </View>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Environment Settings: the branch and deploy-on-push, the server, the name
 * and the danger zone. There is no "Follows the Base" switch: an environment
 * is always the Base plus its own changes, and what it changes is read and
 * edited on Configuration. Deploy order and timing are not served by the API.
 */
export function EnvironmentSettingsView(props: EnvironmentSettingsViewProps) {
  const s = styles(usePalette())
  return (
    <View style={s.page}>
      {props.gitSource}
      <ServerSection {...props} />
      <RenameSection rename={props.rename} canEdit={props.canEdit} />
      {props.danger ? (
        <View>
          <SectionHeading title="Danger zone" danger />
          {props.danger}
        </View>
      ) : null}
    </View>
  )
}
