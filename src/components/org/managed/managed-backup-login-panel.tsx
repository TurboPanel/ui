import { useState } from 'react'
import { Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ConfirmButton, SectionPanel, TextField } from '@/components/ui'
import { managedErrorMessage, type ManagedUserRecord } from '@/lib/managed-services'
import type { TrackedCommandLabel } from '@/lib/queries/commands'
import {
  useCreateManagedBackupLogin,
  useDeleteManagedBackupLogin,
  useManagedBackupLogin,
} from '@/lib/queries/managed'

export const BACKUP_LOGIN_TITLE = 'Backup Login'

export const BACKUP_LOGIN_HELP =
  'A read-only login a backup tool uses to copy every database on this cluster. It sees every row, writes nothing, and always connects to the primary. A cluster has one.'

export const BACKUP_PLACES_HELP =
  "Where the backup tool connects from, separated by commas: 'internal' (this organization's servers), 'server:<id>' or 'address:<ip or range>'. 'any' is not allowed."

export const BACKUP_LOGIN_LOAD_ERROR =
  'The backup login could not be loaded. Reload the page to try again.'

/** The places typed in the field, trimmed, empty entries dropped. */
export function parseBackupPlaces(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/** The places a stored login may connect from, in plain words. */
export function describeBackupPlaces(sources: readonly string[] | undefined): string {
  if (!sources || sources.length === 0 || sources.includes('any')) return 'Anywhere'
  return sources.join(', ')
}

/**
 * The cluster's backup login next to the other logins: shows it when there is
 * one (with Delete), or a short form to add it. The password shows once.
 */
export function ManagedBackupLoginPanel({
  login,
  canManage,
  busy,
  onCreate,
  onDelete,
}: Readonly<{
  login: ManagedUserRecord | null
  canManage: boolean
  busy: boolean
  onCreate: (body: {
    allowedSources: string[]
    username?: string
  }) => Promise<{ password: string; appliedUsername: string }>
  onDelete: () => Promise<void>
}>) {
  const [username, setUsername] = useState('backup')
  const [places, setPlaces] = useState('internal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null)

  if (revealed) {
    return (
      <SectionPanel title={BACKUP_LOGIN_TITLE} hint="One per cluster">
        <SecretReveal
          username={revealed.username}
          password={revealed.password}
          onContinue={() => setRevealed(null)}
          continueLabel="Done"
        />
      </SectionPanel>
    )
  }

  const create = async () => {
    const allowedSources = parseBackupPlaces(places)
    if (allowedSources.length === 0) {
      setError('Choose at least one place the backup tool connects from.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const trimmed = username.trim()
      const result = await onCreate({
        allowedSources,
        ...(trimmed.length > 0 ? { username: trimmed } : {}),
      })
      setRevealed({ username: result.appliedUsername, password: result.password })
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to add the backup login'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete the backup login'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionPanel title={BACKUP_LOGIN_TITLE} hint="One per cluster">
      <View style={panelStyles.detailCard}>
        <Text style={panelStyles.muted}>{BACKUP_LOGIN_HELP}</Text>
        {login ? (
          <>
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Login Name: </Text>
              {login.appliedUsername ?? login.username}
            </Text>
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Connects From: </Text>
              {describeBackupPlaces(login.allowedSources)}
            </Text>
            {canManage ? (
              <ConfirmButton
                label="Delete"
                confirmLabel="Confirm delete"
                prompt="Delete the backup login? Backups that use it stop working."
                disabled={busy || saving}
                onConfirm={() => {
                  void remove()
                }}
              />
            ) : null}
          </>
        ) : null}
        {!login && canManage ? (
          <>
            <TextField
              label="Login Name"
              value={username}
              onChangeText={setUsername}
              placeholder="backup"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy && !saving}
            />
            <TextField
              label="Connects From"
              hint={BACKUP_PLACES_HELP}
              value={places}
              onChangeText={setPlaces}
              placeholder="internal"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy && !saving}
            />
            <Button
              label="Add Backup Login"
              busyLabel="Adding…"
              busy={saving}
              disabled={busy}
              onPress={() => {
                void create()
              }}
            />
          </>
        ) : null}
        {!login && !canManage ? <Text style={panelStyles.muted}>No backup login yet.</Text> : null}
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      </View>
    </SectionPanel>
  )
}

/** {@link ManagedBackupLoginPanel} wired to the backup login queries. */
export function ManagedBackupLoginSection({
  orgId,
  environmentId,
  canManage,
  busy,
  registerCommand,
}: Readonly<{
  orgId: string
  environmentId: string
  canManage: boolean
  busy: boolean
  registerCommand: (commandId: string, label: TrackedCommandLabel, commandServerId?: string) => void
}>) {
  const query = useManagedBackupLogin(orgId, environmentId)
  const createMutation = useCreateManagedBackupLogin(orgId, environmentId)
  const deleteMutation = useDeleteManagedBackupLogin(orgId, environmentId)
  if (query.isPending) return null
  if (query.isError) {
    return (
      <SectionPanel title={BACKUP_LOGIN_TITLE} hint="One per cluster">
        <Text style={panelStyles.error}>{BACKUP_LOGIN_LOAD_ERROR}</Text>
      </SectionPanel>
    )
  }
  // An older control plane, or a viewer without manage: no panel at all.
  if (query.data === null) return null
  return (
    <ManagedBackupLoginPanel
      login={query.data.login}
      canManage={canManage}
      busy={busy}
      onCreate={async (body) => {
        const result = await createMutation.run(body)
        if (!result.ok) throw new Error(result.error ?? 'Failed to add the backup login')
        registerCommand(result.value.commandId, 'Add backup login', result.value.serverId)
        return {
          password: result.value.password,
          appliedUsername: result.value.login.appliedUsername,
        }
      }}
      onDelete={async () => {
        const result = await deleteMutation.mutateAsync()
        registerCommand(result.commandId, 'Delete backup login', result.serverId)
      }}
    />
  )
}
