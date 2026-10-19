import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel, Select, SettingRow, Toggle } from '@/components/ui'
import {
  fetchOrgDirectoryDefaults,
  saveOrgDirectoryDefaults,
  type DirectoryNamesMode,
  type OrgDirectoryDefaultsUpdate,
} from '@/lib/instance-api'
import { DIRECTORY_NAMES_OPTIONS, isDirectoryNamesMode } from '@/lib/directory-names'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

type Draft = { names?: DirectoryNamesMode; locked?: boolean }

/**
 * How service and volume folders are named under a site owner's directory on
 * every server. Readable names are the default; ids avoid renames and domain
 * clashes; "choose for each" lets every service or volume pick. The setting is
 * locked for good once the first folder exists, because existing folders are
 * never renamed.
 */
export function DirectoryDefaultsSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})

  const settingsKey = queryKeys.org(orgId).settings.directoryDefaults
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgDirectoryDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })

  const mutation = useApiMutation({
    mutationFn: (update: OrgDirectoryDefaultsUpdate) => saveOrgDirectoryDefaults(orgId, update),
    onSuccess: async () => {
      setError(null)
      setDraft({})
      await queryClient.invalidateQueries({ queryKey: settingsKey })
    },
    onError: (err) => {
      setError(userErrorMessage(err, 'Failed to save folder naming'))
    },
  })

  const settings = query.data
  const names = draft.names ?? settings?.effectiveNames ?? 'slug'
  const lockedByFolders = settings?.lockedByFolders === true
  const locked = settings?.locked === true
  const lockOn = locked || draft.locked === true
  const pending = mutation.isPending || query.isLoading
  const dirty =
    settings != null && !locked && (names !== settings.effectiveNames || lockOn)

  if (!canManage) return null

  return (
    <SectionPanel title="Folder names" hint="Applies to services and volumes created from now on">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load folder naming')}
        </Text>
      ) : null}
      {lockedByFolders ? (
        <Text style={panelStyles.muted}>
          Locked: folders already exist on your servers, and existing folders are never renamed.
        </Text>
      ) : null}
      {locked && !lockedByFolders ? (
        <Text style={panelStyles.muted}>
          Locked by an owner of this organization. It stays as it is and cannot be changed here.
        </Text>
      ) : null}
      <SettingRow
        label="How folders are named"
        description="Each service and volume gets its own folder under its Hosting Account's directory on the server. Readable names use a name like example.com. Ids use the long id TurboPanel gives the item. Choose for each lets whoever creates the item pick."
      >
        <Select
          value={names}
          options={DIRECTORY_NAMES_OPTIONS}
          placeholder="Select how folders are named"
          disabled={pending || !settings || locked}
          accessibilityLabel="How folders are named"
          onChange={(value) => {
            if (isDirectoryNamesMode(value)) setDraft((d) => ({ ...d, names: value }))
          }}
        />
      </SettingRow>
      <SettingRow
        label="Lock this setting"
        description="Stops it from being changed by mistake. It also locks by itself when the first folder is created."
      >
        <Toggle
          value={lockOn}
          disabled={pending || !settings || locked}
          accessibilityLabel="Lock folder naming"
          onValueChange={() => setDraft((d) => ({ ...d, locked: !lockOn }))}
        />
      </SettingRow>
      {dirty ? (
        <Button
          label="Save"
          busyLabel="Saving…"
          busy={mutation.isPending}
          onPress={() => {
            mutation.mutate({ names, locked: lockOn })
          }}
        />
      ) : null}
    </SectionPanel>
  )
}
