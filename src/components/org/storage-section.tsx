import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import type {
  OrgServerRecord,
  ServiceRecord,
  StorageKind,
  StorageLocationRecord,
  StorageMountRecord,
  StorageRecord,
} from '@/lib/instance-api'
import {
  useCreateStorage,
  useDeleteStorage,
  useStorage,
  useUpdateStorageMount,
} from '@/lib/queries/storage'
import { useServices } from '@/lib/queries/services'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const STORAGE_KINDS: StorageKind[] = ['volume', 'directory', 'file']

const KIND_LABELS: Record<StorageKind, string> = {
  volume: 'Volume',
  directory: 'Directory',
  file: 'File',
}

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  borderRadius: 6,
  minHeight: 44,
} as const

function serverLabel(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname || server.id.slice(0, 8)
}

function serviceLabel(service: ServiceRecord): string {
  return service.displayName?.trim() || service.composeServiceName
}

function inputStyle() {
  return Platform.OS === 'web' ? webInputStyle : styles.input
}

function locationProviderForKind(kind: StorageKind): 'docker' | 'path' {
  return kind === 'volume' ? 'docker' : 'path'
}

function primaryLocation(row: StorageRecord): StorageLocationRecord | undefined {
  return row.locations.find((loc) => loc.role === 'primary') ?? row.locations[0]
}

function useStorageSection({
  orgId,
  environmentId,
  defaultServerId,
  initialShowAdd = false,
}: Readonly<{
  orgId: string
  environmentId: string
  defaultServerId?: string | null
  initialShowAdd?: boolean
}>) {
  const filter = { environmentId }
  const storageQuery = useStorage(orgId, filter)
  const serversQuery = useOrgServers(orgId)
  const servicesQuery = useServices(orgId, environmentId)
  const createMutation = useCreateStorage(orgId, filter)
  const updateMountMutation = useUpdateStorageMount(orgId, filter)
  const deleteMutation = useDeleteStorage(orgId, filter)

  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(initialShowAdd)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<StorageKind>('volume')
  const [serverId, setServerId] = useState(defaultServerId ?? '')
  const [sourcePath, setSourcePath] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [mountServiceId, setMountServiceId] = useState('')

  useEffect(() => {
    if (defaultServerId) {
      setServerId(defaultServerId)
    }
  }, [defaultServerId])

  const rows = storageQuery.data?.storage ?? []
  const servers = serversQuery.data?.servers ?? []
  const services = servicesQuery.data?.services ?? []
  const loading = storageQuery.isLoading || serversQuery.isLoading

  let queryError: string | null = null
  if (storageQuery.isError) {
    queryError =
      storageQuery.error instanceof Error
        ? storageQuery.error.message
        : 'Failed to load storage'
  }
  const displayError =
    error ??
    createMutation.actionError ??
    updateMountMutation.actionError ??
    deleteMutation.actionError ??
    queryError

  const handleAdd = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    if (!serverId) {
      setError('Select a server.')
      return
    }
    const trimmedDest = destinationPath.trim()
    if (trimmedDest && !mountServiceId) {
      setError('Select a service to mount into.')
      return
    }
    setError(null)
    const provider = locationProviderForKind(kind)
    createMutation.mutate(
      {
        environmentId,
        kind,
        name: trimmedName,
        location: {
          provider,
          serverId,
          ...(provider === 'path' && sourcePath.trim()
            ? { path: sourcePath.trim() }
            : {}),
        },
        ...(trimmedDest && mountServiceId
          ? { mount: { serviceId: mountServiceId, destinationPath: trimmedDest } }
          : {}),
      },
      {
        onSuccess: () => {
          setName('')
          setSourcePath('')
          setDestinationPath('')
          setMountServiceId('')
          setShowAdd(false)
        },
        onError: () => {
          setError(createMutation.actionError ?? 'Failed to create storage')
        },
      },
    )
  }

  const handleDestinationPathSave = async (
    storageId: string,
    mountId: string,
    nextDestinationPath: string,
  ) => {
    setError(null)
    const result = await updateMountMutation.run({
      storageId,
      mountId,
      body: { destinationPath: nextDestinationPath },
    })
    if (!result.ok && result.error) {
      setError(result.error)
    }
  }

  const handleDelete = (id: string) => {
    setError(null)
    deleteMutation.mutate(id, {
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete storage')
      },
    })
  }

  const deletingId =
    deleteMutation.isPending &&
    typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null

  return {
    rows,
    servers,
    services,
    loading,
    error: displayError,
    deletingId,
    showAdd,
    setShowAdd,
    name,
    setName,
    kind,
    setKind,
    serverId,
    setServerId,
    sourcePath,
    setSourcePath,
    destinationPath,
    setDestinationPath,
    mountServiceId,
    setMountServiceId,
    adding: createMutation.isPending,
    handleAdd,
    handleDelete,
    handleDestinationPathSave,
  }
}

function StorageListStatus({
  loading,
  isEmpty,
}: Readonly<{ loading: boolean; isEmpty: boolean }>) {
  if (loading && isEmpty) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }
  if (!loading && isEmpty) {
    return <Text style={orgPanelStyles.muted}>No storage entries yet.</Text>
  }
  return null
}

function StorageAddForm({
  adding,
  name,
  kind,
  serverId,
  sourcePath,
  destinationPath,
  mountServiceId,
  servers,
  services,
  onNameChange,
  onKindChange,
  onServerIdChange,
  onSourcePathChange,
  onDestinationPathChange,
  onMountServiceIdChange,
  onSubmit,
}: Readonly<{
  adding: boolean
  name: string
  kind: StorageKind
  serverId: string
  sourcePath: string
  destinationPath: string
  mountServiceId: string
  servers: OrgServerRecord[]
  services: ServiceRecord[]
  onNameChange: (value: string) => void
  onKindChange: (value: StorageKind) => void
  onServerIdChange: (value: string) => void
  onSourcePathChange: (value: string) => void
  onDestinationPathChange: (value: string) => void
  onMountServiceIdChange: (value: string) => void
  onSubmit: () => void
}>) {
  const showSourcePath = kind !== 'volume'
  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={inputStyle()}
          value={name}
          onChangeText={onNameChange}
          placeholder="data"
          placeholderTextColor={colors.textDim}
          editable={!adding}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Kind</Text>
        <View style={styles.kindRow}>
          {STORAGE_KINDS.map((option) => (
            <Pressable
              key={option}
              style={[styles.kindChip, kind === option && styles.kindChipActive]}
              disabled={adding}
              onPress={() => onKindChange(option)}
            >
              <Text style={styles.kindChipText}>{KIND_LABELS[option]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Server *</Text>
        <View style={styles.serverList}>
          {servers.map((server) => (
            <Pressable
              key={server.id}
              style={[
                styles.serverOption,
                serverId === server.id && styles.serverOptionSelected,
              ]}
              disabled={adding}
              onPress={() => onServerIdChange(server.id)}
            >
              <Text style={styles.serverOptionText}>{serverLabel(server)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {showSourcePath ? (
        <View style={styles.field}>
          <Text style={styles.label}>Host path</Text>
          <TextInput
            style={inputStyle()}
            value={sourcePath}
            onChangeText={onSourcePathChange}
            placeholder="/host/path"
            placeholderTextColor={colors.textDim}
            editable={!adding}
            autoCapitalize="none"
          />
        </View>
      ) : null}
      {services.length > 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Mount service</Text>
          <View style={styles.serverList}>
            {services.map((service) => (
              <Pressable
                key={service.id}
                style={[
                  styles.serverOption,
                  mountServiceId === service.id && styles.serverOptionSelected,
                ]}
                disabled={adding}
                onPress={() => onMountServiceIdChange(service.id)}
              >
                <Text style={styles.serverOptionText}>{serviceLabel(service)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>Destination path</Text>
        <TextInput
          style={inputStyle()}
          value={destinationPath}
          onChangeText={onDestinationPathChange}
          placeholder="/container/path"
          placeholderTextColor={colors.textDim}
          editable={!adding}
          autoCapitalize="none"
        />
      </View>
      <Pressable
        style={[styles.submitButton, adding && styles.buttonDisabled]}
        disabled={adding}
        onPress={onSubmit}
      >
        <Text style={styles.submitButtonText}>
          {adding ? 'Adding…' : 'Create storage'}
        </Text>
      </Pressable>
    </View>
  )
}

function locationServerText(
  location: StorageLocationRecord,
  servers: OrgServerRecord[],
): string {
  if (!location.serverId) return 'shared'
  const server = servers.find((row) => row.id === location.serverId)
  if (server) return serverLabel(server)
  return `${location.serverId.slice(0, 8)}…`
}

function LocationSummary({
  location,
  servers,
}: Readonly<{
  location: StorageLocationRecord | undefined
  servers: OrgServerRecord[]
}>) {
  if (!location) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Location: </Text>
        none
      </Text>
    )
  }
  const pathText = location.resolvedSourcePath ?? location.path
  return (
    <>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Location: </Text>
        {location.provider} · {locationServerText(location, servers)}
      </Text>
      {pathText ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Path: </Text>
          {pathText}
        </Text>
      ) : null}
    </>
  )
}

function MountDestination({
  storageId,
  mount,
  canManage,
  onSave,
}: Readonly<{
  storageId: string
  mount: StorageMountRecord
  canManage: boolean
  onSave: (storageId: string, mountId: string, destinationPath: string) => Promise<void>
}>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(mount.destinationPath)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(mount.destinationPath)
  }, [mount.destinationPath])

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === mount.destinationPath) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(storageId, mount.id, trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (canManage && editing) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>Destination path</Text>
        <TextInput
          style={inputStyle()}
          value={draft}
          onChangeText={setDraft}
          placeholder="/container/path"
          placeholderTextColor={colors.textDim}
          editable={!saving}
          autoCapitalize="none"
        />
        <View style={styles.editActions}>
          <Pressable
            style={[styles.submitButton, saving && styles.buttonDisabled]}
            disabled={saving}
            onPress={() => {
              void save()
            }}
          >
            <Text style={styles.submitButtonText}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.cancelButton}
            disabled={saving}
            onPress={() => {
              setDraft(mount.destinationPath)
              setEditing(false)
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Pressable
      disabled={!canManage}
      onPress={() => {
        if (canManage) setEditing(true)
      }}
    >
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Mount: </Text>
        {mount.destinationPath}
        {mount.readOnly ? ' (read-only)' : ''}
      </Text>
    </Pressable>
  )
}

function StorageRow({
  row,
  servers,
  canManage,
  deleting,
  onDelete,
  onDestinationPathSave,
}: Readonly<{
  row: StorageRecord
  servers: OrgServerRecord[]
  canManage: boolean
  deleting: boolean
  onDelete: (id: string) => void
  onDestinationPathSave: (
    storageId: string,
    mountId: string,
    destinationPath: string,
  ) => Promise<void>
}>) {
  const location = primaryLocation(row)
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.rowHeader}>
        <Text style={orgPanelStyles.detailTitle}>{row.name}</Text>
        <Text style={styles.kindBadge}>{KIND_LABELS[row.kind]}</Text>
      </View>
      <LocationSummary location={location} servers={servers} />
      {row.mounts.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No service mounts</Text>
      ) : (
        row.mounts.map((mount) => (
          <MountDestination
            key={mount.id}
            storageId={row.id}
            mount={mount}
            canManage={canManage}
            onSave={onDestinationPathSave}
          />
        ))
      )}
      {canManage ? (
        <Pressable
          style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          disabled={deleting}
          onPress={() => onDelete(row.id)}
        >
          <Text style={styles.deleteButtonText}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function StorageSection({
  orgId,
  environmentId,
  defaultServerId,
  embedded = false,
  initialShowAdd = false,
}: Readonly<{
  orgId: string
  environmentId: string
  defaultServerId?: string | null
  /** Body only — no surrounding `SectionPanel` (Settings Add Storage). */
  embedded?: boolean
  /** Open the add form on mount. */
  initialShowAdd?: boolean
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const storage = useStorageSection({
    orgId,
    environmentId,
    defaultServerId,
    initialShowAdd,
  })

  const body = (
    <>
      {storage.error ? <Text style={orgPanelStyles.error}>{storage.error}</Text> : null}

      {canManage ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() => storage.setShowAdd((current) => !current)}
        >
          <Text style={styles.primaryButtonText}>
            {storage.showAdd ? 'Cancel' : 'Add storage'}
          </Text>
        </Pressable>
      ) : null}

      {storage.showAdd && canManage ? (
        <StorageAddForm
          adding={storage.adding}
          name={storage.name}
          kind={storage.kind}
          serverId={storage.serverId}
          sourcePath={storage.sourcePath}
          destinationPath={storage.destinationPath}
          mountServiceId={storage.mountServiceId}
          servers={storage.servers}
          services={storage.services}
          onNameChange={storage.setName}
          onKindChange={storage.setKind}
          onServerIdChange={storage.setServerId}
          onSourcePathChange={storage.setSourcePath}
          onDestinationPathChange={storage.setDestinationPath}
          onMountServiceIdChange={storage.setMountServiceId}
          onSubmit={storage.handleAdd}
        />
      ) : null}

      <StorageListStatus loading={storage.loading} isEmpty={storage.rows.length === 0} />
      <View style={styles.list}>
        {storage.rows.map((row) => (
          <StorageRow
            key={row.id}
            row={row}
            servers={storage.servers}
            canManage={canManage}
            deleting={storage.deletingId === row.id}
            onDelete={storage.handleDelete}
            onDestinationPathSave={storage.handleDestinationPathSave}
          />
        ))}
      </View>
    </>
  )

  if (embedded) {
    return <View style={styles.embedded}>{body}</View>
  }

  return (
    <SectionPanel title="Storage" hint="Volumes, directories, and files for this environment">
      {body}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  embedded: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  kindBadge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: chrome.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 6,
    minHeight: 44,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  kindChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kindChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  kindChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  serverList: {
    gap: spacing.xs,
  },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  serverOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  serverOptionText: {
    color: colors.text,
    fontSize: 13,
  },
  submitButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  cancelButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.bgSecondary,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  deleteButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
