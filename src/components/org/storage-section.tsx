import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createStorage,
  deleteStorage,
  fetchOrgServers,
  fetchStorage,
  isForbiddenError,
  updateStorage,
  type OrgServerRecord,
  type StorageKind,
  type StorageRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const STORAGE_KINDS: StorageKind[] = [
  'docker_volume',
  'bind_mount',
  'file',
  'directory',
]

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

function inputStyle() {
  return Platform.OS === 'web' ? webInputStyle : styles.input
}

async function handleStorageApiError(
  err: unknown,
  handleUnauthorized: () => Promise<void>,
  setError: (message: string) => void,
  fallbackMessage: string,
): Promise<boolean> {
  if (isForbiddenError(err)) {
    await handleUnauthorized()
    return true
  }
  setError(err instanceof Error ? err.message : fallbackMessage)
  return false
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
  servers,
  onNameChange,
  onKindChange,
  onServerIdChange,
  onSourcePathChange,
  onDestinationPathChange,
  onSubmit,
}: Readonly<{
  adding: boolean
  name: string
  kind: StorageKind
  serverId: string
  sourcePath: string
  destinationPath: string
  servers: OrgServerRecord[]
  onNameChange: (value: string) => void
  onKindChange: (value: StorageKind) => void
  onServerIdChange: (value: string) => void
  onSourcePathChange: (value: string) => void
  onDestinationPathChange: (value: string) => void
  onSubmit: () => void
}>) {
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
              <Text style={styles.kindChipText}>{option.replaceAll('_', ' ')}</Text>
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
      <View style={styles.field}>
        <Text style={styles.label}>Source path</Text>
        <TextInput
          style={inputStyle()}
          value={sourcePath}
          onChangeText={onSourcePathChange}
          placeholder="/host/path or volume source"
          placeholderTextColor={colors.textDim}
          editable={!adding}
          autoCapitalize="none"
        />
      </View>
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

function useStorageSection({
  environmentId,
  defaultServerId,
  handleUnauthorized,
}: Readonly<{
  environmentId: string
  defaultServerId?: string | null
  handleUnauthorized: () => Promise<void>
}>) {
  const [rows, setRows] = useState<StorageRecord[]>([])
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<StorageKind>('docker_volume')
  const [serverId, setServerId] = useState(defaultServerId ?? '')
  const [sourcePath, setSourcePath] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [storageResult, serversResult] = await Promise.all([
        fetchStorage({ environmentId }),
        fetchOrgServers(),
      ])
      setRows(storageResult.storage)
      setServers(serversResult.servers)
      if (!serverId && defaultServerId) {
        setServerId(defaultServerId)
      }
    } catch (err) {
      if (await handleStorageApiError(err, handleUnauthorized, setError, 'Failed to load storage')) {
        return
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [environmentId, handleUnauthorized])

  useEffect(() => {
    if (defaultServerId) {
      setServerId(defaultServerId)
    }
  }, [defaultServerId])

  const handleAdd = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    if (!serverId) {
      setError('Select a server.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await createStorage({
        environmentId,
        serverId,
        kind,
        name: trimmedName,
        ...(sourcePath.trim() ? { sourcePath: sourcePath.trim() } : {}),
        ...(destinationPath.trim() ? { destinationPath: destinationPath.trim() } : {}),
      })
      setName('')
      setSourcePath('')
      setDestinationPath('')
      setShowAdd(false)
      await load()
    } catch (err) {
      await handleStorageApiError(err, handleUnauthorized, setError, 'Failed to create storage')
    } finally {
      setAdding(false)
    }
  }

  const handleDestinationPathSave = async (id: string, destinationPath: string) => {
    setError(null)
    try {
      await updateStorage(id, { destinationPath })
      await load()
    } catch (err) {
      await handleStorageApiError(err, handleUnauthorized, setError, 'Failed to update storage')
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteStorage(id)
      await load()
    } catch (err) {
      await handleStorageApiError(err, handleUnauthorized, setError, 'Failed to delete storage')
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return {
    rows,
    servers,
    loading,
    error,
    deleting,
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
    adding,
    handleAdd,
    handleDelete,
    handleDestinationPathSave,
  }
}

function StorageRow({
  row,
  canManage,
  deleting,
  onDelete,
  onDestinationPathSave,
}: Readonly<{
  row: StorageRecord
  canManage: boolean
  deleting: boolean
  onDelete: (id: string) => void
  onDestinationPathSave: (id: string, destinationPath: string) => Promise<void>
}>) {
  const [editingDestination, setEditingDestination] = useState(false)
  const [destinationDraft, setDestinationDraft] = useState(row.destinationPath ?? '')
  const [savingDestination, setSavingDestination] = useState(false)

  useEffect(() => {
    setDestinationDraft(row.destinationPath ?? '')
  }, [row.destinationPath])

  const saveDestination = async () => {
    const trimmed = destinationDraft.trim()
    if (!trimmed || trimmed === row.destinationPath) {
      setEditingDestination(false)
      return
    }
    setSavingDestination(true)
    try {
      await onDestinationPathSave(row.id, trimmed)
      setEditingDestination(false)
    } finally {
      setSavingDestination(false)
    }
  }

  const renderDestinationSection = () => {
    if (canManage && editingDestination) {
      return (
        <View style={styles.field}>
          <Text style={styles.label}>Destination path</Text>
          <TextInput
            style={inputStyle()}
            value={destinationDraft}
            onChangeText={setDestinationDraft}
            placeholder="/container/path"
            placeholderTextColor={colors.textDim}
            editable={!savingDestination}
            autoCapitalize="none"
          />
          <View style={styles.editActions}>
            <Pressable
              style={[styles.submitButton, savingDestination && styles.buttonDisabled]}
              disabled={savingDestination}
              onPress={() => {
                void saveDestination()
              }}
            >
              <Text style={styles.submitButtonText}>
                {savingDestination ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              disabled={savingDestination}
              onPress={() => {
                setDestinationDraft(row.destinationPath ?? '')
                setEditingDestination(false)
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )
    }
    if (row.destinationPath) {
      return (
        <Pressable
          disabled={!canManage}
          onPress={() => {
            if (canManage) setEditingDestination(true)
          }}
        >
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Destination: </Text>
            {row.destinationPath}
          </Text>
        </Pressable>
      )
    }
    if (canManage) {
      return (
        <Pressable onPress={() => setEditingDestination(true)}>
          <Text style={orgPanelStyles.muted}>Add destination path</Text>
        </Pressable>
      )
    }
    return null
  }

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.rowHeader}>
        <Text style={orgPanelStyles.detailTitle}>{row.name}</Text>
        <Text style={styles.kindBadge}>{row.kind.replaceAll('_', ' ')}</Text>
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Server: </Text>
        {row.serverId.slice(0, 8)}…
      </Text>
      {row.sourcePath ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Source: </Text>
          {row.sourcePath}
        </Text>
      ) : null}
      {renderDestinationSection()}
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
}: Readonly<{
  orgId: string
  environmentId: string
  defaultServerId?: string | null
}>) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const storage = useStorageSection({ environmentId, defaultServerId, handleUnauthorized })

  return (
    <SectionPanel title="Storage" hint="Volumes and bind mounts for this environment">
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
          servers={storage.servers}
          onNameChange={storage.setName}
          onKindChange={storage.setKind}
          onServerIdChange={storage.setServerId}
          onSourcePathChange={storage.setSourcePath}
          onDestinationPathChange={storage.setDestinationPath}
          onSubmit={() => {
            void storage.handleAdd()
          }}
        />
      ) : null}

      <StorageListStatus loading={storage.loading} isEmpty={storage.rows.length === 0} />
      <View style={styles.list}>
        {storage.rows.map((row) => (
          <StorageRow
            key={row.id}
            row={row}
            canManage={canManage}
            deleting={storage.deleting.has(row.id)}
            onDelete={(id) => {
              void storage.handleDelete(id)
            }}
            onDestinationPathSave={storage.handleDestinationPathSave}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
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
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.accent,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  serverOptionText: {
    color: colors.text,
    fontSize: 13,
  },
  submitButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: colors.buttonText,
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
