import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button, FormField, SegmentedControl, TextField, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { folderNameKindOf, folderNameProblem, serviceFolderWhere } from '@/lib/directory-names'
import type { DirectoryNameKind, ServiceRecord } from '@/lib/instance-api'
import { useEnvironmentFolders, useDirectoryNamesMode } from '@/lib/queries/folders'
import { useUpdateService } from '@/lib/queries/services'
import { useCan } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

const KIND_OPTIONS = [
  { value: 'slug', label: 'Readable name' },
  { value: 'uuid', label: 'Id' },
] as const

/**
 * The folder a service gets under its site owner's directory on a server. The
 * name and "shared across environments" can change only until the first folder
 * exists; after that they are locked, and this says why instead of failing on
 * save. A service gets its folder at the first deploy.
 */
export function ServiceFolderSettings({
  orgId,
  service,
  canManage,
}: Readonly<{ orgId: string; service: ServiceRecord; canManage: boolean }>) {
  const canManageOrg = useCan('organization', orgId, 'organization:manage')
  const mode = useDirectoryNamesMode(orgId, canManageOrg)
  const folders = useEnvironmentFolders(orgId, service.environmentId)
  const update = useUpdateService(orgId, service.id)
  const [name, setName] = useState(service.slug ?? '')
  const [kind, setKind] = useState<DirectoryNameKind>(folderNameKindOf(service.slug))
  const [error, setError] = useState<string | null>(null)

  const checking = folders.isLoading
  const checkFailed = folders.isError
  const locked = (folders.data?.folders ?? []).some((folder) => folder.assetId === service.id)
  const common = service.common === true
  const typedAllowed = mode === 'slug' || (mode === 'both' && kind === 'slug')
  const problem = typedAllowed ? folderNameProblem(name) : null
  const changed = typedAllowed && name.trim() !== '' && name.trim() !== (service.slug ?? '')
  const disabled = !canManage || locked || checking || checkFailed || update.isPending

  const save = (body: Parameters<typeof update.mutate>[0]) => {
    setError(null)
    update.mutate(body, { onError: (err) => setError(userErrorMessage(err, 'Could not save')) })
  }

  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>Folder on the server</Text>
      <Text style={panelStyles.muted}>
        {service.slug
          ? serviceFolderWhere(service.slug, common)
          : 'Created at the first deploy. A website named by its domain uses the domain.'}
      </Text>
      {checking ? <Text style={panelStyles.muted}>Checking whether it already has a folder…</Text> : null}
      {checkFailed ? (
        <Text style={panelStyles.muted}>
          Could not check whether it already has a folder, so these settings are read-only for now.
        </Text>
      ) : null}
      {locked ? (
        <Text style={panelStyles.muted}>
          Locked: this service already has a folder on a server, and folders are never renamed.
        </Text>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {mode === 'both' ? (
        <FormField label="Folder name">
          <SegmentedControl
            options={KIND_OPTIONS}
            value={kind}
            disabled={disabled}
            onChange={setKind}
            accessibilityLabel="Folder name kind"
          />
        </FormField>
      ) : null}
      {typedAllowed ? (
        <TextField
          label="Folder name"
          value={name}
          onChangeText={setName}
          editable={!disabled}
          autoCapitalize="none"
          error={problem}
        />
      ) : (
        <Text style={panelStyles.muted}>This organization names folders by id.</Text>
      )}
      {changed || (mode === 'both' && kind === 'uuid' && !locked) ? (
        <Button
          label="Save folder name"
          busy={update.isPending}
          disabled={disabled || problem !== null}
          onPress={() =>
            save(
              kind === 'uuid' && mode === 'both'
                ? { directoryName: 'uuid' }
                : { slug: name.trim(), ...(mode === 'both' ? { directoryName: 'slug' as const } : {}) }
            )
          }
        />
      ) : null}
      <FormField label="Shared across environments">
        <Toggle
          value={common}
          disabled={disabled}
          accessibilityLabel="Share this service across environments"
          onValueChange={() => save({ common: !common })}
        />
      </FormField>
    </View>
  )
}
