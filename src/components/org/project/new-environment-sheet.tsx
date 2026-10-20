import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { MiniMap } from '@/components/org/project/mini-map'
import { TextField } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { ChoiceCard, ChoiceGroup } from '@/components/ui/v4/choice-card'
import { Sheet } from '@/components/ui/v4/sheet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { ENVIRONMENT_NAME_MAX_LENGTH, validateEnvironmentName } from '@/lib/environment-validation'
import type { ConfigViewSide } from '@/lib/instance-api'
import { NOT_COPIED_NOTE } from '@/lib/v4/primary-environment'
import { useCreateEnvironment } from '@/lib/queries/environments'
import { useOrgServers } from '@/lib/queries/servers'
import { serverDisplayName } from '@/lib/resource-labels'
import {
  newEnvironmentBody,
  startChoices,
  startPreview,
  type NewEnvironmentStart,
} from '@/lib/v4/project-home'

const styles = themedStyles((p) => ({
  label: { ...typeStyle('bodySemibold', 'subhead'), color: p.text },
  hint: { ...typeStyle('body', 'footnote'), color: p.text3 },
  section: { gap: 8 },
  error: { ...typeStyle('body', 'footnote'), color: p.bad },
}))

/** The server choice. No pin means the environment uses the project's server. */
function ServerChoices({
  orgId,
  hasProjectServer,
  serverId,
  onChange,
}: Readonly<{
  orgId: string
  hasProjectServer: boolean
  serverId: string | null
  onChange: (serverId: string | null) => void
}>) {
  const s = styles(usePalette())
  const serversQuery = useOrgServers(orgId)
  const servers = (serversQuery.data?.servers ?? []).filter((server) => server.connected)
  return (
    <View style={s.section}>
      <Text style={s.label}>Server</Text>
      <ChoiceGroup label="Server">
        <ChoiceCard
          title={hasProjectServer ? "Use the project's server" : 'Choose a server later'}
          body={
            hasProjectServer
              ? 'Nothing to pick now. You can move it to another server later.'
              : 'The project has no server yet. Pick one for this environment before you deploy it.'
          }
          selected={serverId === null}
          onSelect={() => onChange(null)}
        />
        {servers.map((server) => (
          <ChoiceCard
            key={server.id}
            title={serverDisplayName(server)}
            body={server.address ?? server.hostname ?? undefined}
            selected={serverId === server.id}
            onSelect={() => onChange(server.id)}
          />
        ))}
      </ChoiceGroup>
    </View>
  )
}

/**
 * The New environment sheet: a name, what to start from, and a server.
 *
 * The start is always named in the request. "Copy of <primary environment>" is
 * preselected (the copy is made by the control plane, so domains and secret
 * values are never duplicated by the browser); "Empty, stands alone" is the
 * other choice. Either way the environment inherits from the Base the way
 * every environment does. Nothing deploys until Deploy is pressed.
 */
export function NewEnvironmentSheet({
  orgId,
  projectId,
  visible,
  primaryName,
  primary,
  hasProjectServer,
  onClose,
  onCreated,
}: Readonly<{
  orgId: string
  projectId: string
  visible: boolean
  /** The primary environment's name, for the "Copy of" choice; `null` until the list is read. */
  primaryName: string | null
  /** What the primary environment runs, as read from its config-view; `null` until read. */
  primary: ConfigViewSide | null
  hasProjectServer: boolean
  onClose: () => void
  onCreated: (environmentId: string) => void | Promise<void>
}>) {
  const s = styles(usePalette())
  const createEnvironment = useCreateEnvironment(orgId)
  const [name, setName] = useState('')
  const [start, setStart] = useState<NewEnvironmentStart>('copy')
  const [serverId, setServerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; notCopied: string[] } | null>(null)
  const choices = useMemo(() => startChoices(primaryName), [primaryName])
  const preview = useMemo(() => startPreview(start, primary), [start, primary])

  const submit = async () => {
    if (createEnvironment.isPending) return
    const validation = validateEnvironmentName(name.trim())
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    const result = await createEnvironment.run(
      newEnvironmentBody({ projectId, name, start, serverId })
    )
    if (!result.ok) {
      setError(result.error ?? 'Could not create the environment.')
      return
    }
    const notCopied = start === 'copy' ? (result.value.notCopied ?? []) : []
    if (notCopied.length > 0) {
      setCreated({ id: result.value.id, notCopied })
      return
    }
    await onCreated(result.value.id)
  }

  if (created) {
    return (
      <Sheet
        visible={visible}
        onClose={() => void onCreated(created.id)}
        title="Environment created"
        footer={
          <ActionButton
            label="Open it"
            variant="primary"
            onPress={() => void onCreated(created.id)}
          />
        }
      >
        <View style={s.section}>
          <Text style={s.label}>These were not copied from the primary environment:</Text>
          {created.notCopied.map((item) => (
            <Text key={item} style={s.hint}>{`• ${item}`}</Text>
          ))}
        </View>
      </Sheet>
    )
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New environment"
      why="Nothing deploys until you press Deploy."
      footer={
        <>
          <ActionButton label="Cancel" variant="quiet" onPress={onClose} />
          <ActionButton
            label="Create environment"
            variant="primary"
            busy={createEnvironment.isPending}
            busyLabel="Creating…"
            onPress={() => {
              submit().catch(() => {
                setError('Could not create the environment.')
              })
            }}
          />
        </>
      }
    >
      <TextField
        label="Name"
        value={name}
        onChangeText={(value) => {
          setName(value)
          setError(null)
        }}
        placeholder="e.g. staging"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!createEnvironment.isPending}
        maxLength={ENVIRONMENT_NAME_MAX_LENGTH}
        accessibilityLabel="New environment name"
        error={error}
      />
      <View style={s.section}>
        <Text style={s.label}>Start from</Text>
        <ChoiceGroup label="Start from">
          {choices.map((choice) => (
            <ChoiceCard
              key={choice.key}
              title={choice.title}
              body={choice.body}
              alone={choice.key === 'empty'}
              selected={start === choice.key}
              onSelect={() => setStart(choice.key)}
            />
          ))}
        </ChoiceGroup>
        {start === 'copy' ? <Text style={s.hint}>{NOT_COPIED_NOTE}</Text> : null}
      </View>
      <ServerChoices
        orgId={orgId}
        hasProjectServer={hasProjectServer}
        serverId={serverId}
        onChange={setServerId}
      />
      <View style={s.section}>
        <Text style={s.label}>What it will run</Text>
        {preview ? (
          <MiniMap columns={preview} accessibilityLabel="What the new environment will run" />
        ) : (
          <Text style={s.hint}>
            The primary environment could not be read yet, so there is nothing to preview.
          </Text>
        )}
      </View>
    </Sheet>
  )
}
