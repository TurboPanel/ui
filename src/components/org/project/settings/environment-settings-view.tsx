import { useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { TextField } from '@/components/ui'
import { ActionButton, ListGroup, ListRow, SectionHeading, Sheet } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  MAKE_PRIMARY_EXPLANATION,
  PIN_EXPLANATION,
  pinActionLabel,
} from '@/lib/v4/primary-environment'
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
  error: { ...typeStyle('body', 'subhead'), color: p.bad },
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

/** Where this environment sits in the project: primary, pinned or neither. */
export type PlacementFacts = Readonly<{
  isPrimary: boolean
  pinned: boolean
  /** The project has only this environment: nothing to pin or to hand the primary role to. */
  alone: boolean
  busy: boolean
  /** Resolves with a plain message when it was refused, `null` when it worked. */
  onMakePrimary: () => Promise<string | null>
  onTogglePin: () => void
}>

export type EnvironmentSettingsViewProps = Readonly<{
  environmentName: string
  canEdit: boolean
  placement: PlacementFacts
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
  /** Why delete is not offered (the primary environment); replaces the control. */
  deleteNote: string | null
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

function MakePrimarySheet({
  environmentName,
  busy,
  error,
  onConfirm,
  onClose,
}: Readonly<{
  environmentName: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}>) {
  const s = styles(usePalette())
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Make ${environmentName} the primary environment?`}
      footer={
        <>
          <ActionButton label="Cancel" variant="quiet" onPress={onClose} disabled={busy} />
          <ActionButton label="Make primary" busy={busy} onPress={onConfirm} />
        </>
      }
    >
      <Text style={s.line}>{MAKE_PRIMARY_EXPLANATION}</Text>
      <Text style={s.line}>
        {`The project will open on ${environmentName}, and the current primary environment keeps running as it is.`}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </Sheet>
  )
}

/** Primary and pinned: where this environment is listed and what the project opens on. */
function PlacementSection(props: Readonly<EnvironmentSettingsViewProps>) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { placement, canEdit, environmentName } = props
  const canChange = canEdit && !placement.alone
  const confirm = async () => {
    setSending(true)
    setProblem(null)
    try {
      const message = await placement.onMakePrimary()
      if (message === null) setConfirming(false)
      else setProblem(message)
    } finally {
      setSending(false)
    }
  }
  return (
    <View>
      <SectionHeading title="Primary environment" note="Where the project opens" />
      <ListGroup>
        {placement.isPrimary ? (
          <ListRow
            title="This is the primary environment"
            sub={MAKE_PRIMARY_EXPLANATION}
            value="Primary"
          />
        ) : (
          <ListRow
            title="Make this the primary environment"
            sub={MAKE_PRIMARY_EXPLANATION}
            trailing={
              canChange ? (
                <ActionButton
                  label="Make primary"
                  variant="secondary"
                  size="sm"
                  onPress={() => setConfirming(true)}
                />
              ) : undefined
            }
          />
        )}
        {placement.isPrimary ? null : (
          <ListRow
            title={placement.pinned ? 'Pinned' : 'Not pinned'}
            sub={PIN_EXPLANATION}
            trailing={
              canChange ? (
                <ActionButton
                  label={pinActionLabel(placement.pinned)}
                  variant="secondary"
                  size="sm"
                  busy={placement.busy}
                  onPress={placement.onTogglePin}
                />
              ) : undefined
            }
          />
        )}
      </ListGroup>
      {confirming ? (
        <MakePrimarySheet
          environmentName={environmentName}
          busy={sending || placement.busy}
          error={problem}
          onClose={() => {
            setConfirming(false)
            setProblem(null)
          }}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </View>
  )
}

function RenameSection({
  rename,
  canEdit,
}: Readonly<{ rename: RenameFormProps; canEdit: boolean }>) {
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
            <ActionButton
              label="Save"
              onPress={rename.onSave}
              disabled={!rename.canSave}
              busy={rename.saving}
            />
            <ActionButton
              label="Discard"
              variant="quiet"
              onPress={rename.onReset}
              disabled={rename.saving}
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Environment Settings: the branch and deploy-on-push, the server, the name
 * and the danger zone. There is no switch for how an environment relates to the Base: an environment
 * is always the Base plus its own changes, and what it changes is read and
 * edited on Configuration. Deploy order and timing are not served by the API.
 */
export function EnvironmentSettingsView(props: EnvironmentSettingsViewProps) {
  const s = styles(usePalette())
  return (
    <View style={s.page}>
      {props.gitSource}
      <PlacementSection {...props} />
      <ServerSection {...props} />
      <RenameSection rename={props.rename} canEdit={props.canEdit} />
      {props.danger || props.deleteNote ? (
        <View>
          <SectionHeading title="Danger zone" danger />
          {props.deleteNote ? <Text style={s.line}>{props.deleteNote}</Text> : props.danger}
        </View>
      ) : null}
    </View>
  )
}
