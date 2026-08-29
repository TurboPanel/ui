import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  SectionPanel,
} from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { LicenseRecord } from '@/lib/instance-api'
import {
  pendingKeyDisplayName,
  unboundPendingKeys,
  unusedRegistrationKeysLabel,
} from '@/lib/pending-keys'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useDeleteLicense, useOrgLicenses } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { colors, spacing, webPointer } from '@/lib/theme'

function pendingKeysHint(loading: boolean, count: number): string {
  if (loading) return 'Loading…'
  return unusedRegistrationKeysLabel(count)
}

function PendingKeyDeleteControl({
  row,
  confirming,
  deleting,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Readonly<{
  row: LicenseRecord
  confirming: boolean
  deleting: boolean
  onRequestConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  const title = pendingKeyDisplayName(row)

  if (!row.revocable) {
    return <Text style={panelStyles.muted}>Protected</Text>
  }

  if (deleting) {
    return (
      <View style={styles.deleteBusy}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={panelStyles.muted}>Deleting…</Text>
      </View>
    )
  }

  if (confirming) {
    return (
      <View style={styles.deleteActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Confirm delete ${title}`}
          style={({ pressed }) => [
            panelStyles.toolbarBtnPrimary,
            pressed && styles.pressed,
            webPointer,
          ]}
          onPress={onConfirm}
        >
          <Text style={panelStyles.toolbarBtnTextPrimary}>Confirm delete</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel delete"
          style={({ pressed }) => [
            panelStyles.toolbarBtnSecondary,
            pressed && styles.pressed,
            webPointer,
          ]}
          onPress={onCancel}
        >
          <Text style={panelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete ${title}`}
      style={({ pressed }) => [
        panelStyles.toolbarBtnSecondary,
        pressed && styles.pressed,
        webPointer,
      ]}
      onPress={onRequestConfirm}
    >
      <Text style={panelStyles.toolbarBtnTextSecondary}>Delete</Text>
    </Pressable>
  )
}

const PENDING_KEY_COLUMNS = [
  { key: 'name', header: 'Name', flex: 1.6, minWidth: 140 },
  { key: 'created', header: 'Created', flex: 1.4, minWidth: 160 },
  { key: 'delete', header: 'Delete', flex: 1.4, minWidth: 160, align: 'end' },
] as const satisfies readonly DataTableColumn[]

function PendingKeyRow({
  row,
  rowIndex,
  confirming,
  deleting,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Readonly<{
  row: LicenseRecord
  rowIndex: number
  confirming: boolean
  deleting: boolean
  onRequestConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  const title = pendingKeyDisplayName(row)

  const [nameColumn, createdColumn, deleteColumn] = PENDING_KEY_COLUMNS

  return (
    <DataTableRow alt={rowIndex % 2 === 1}>
      <DataTableCell column={nameColumn}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
      </DataTableCell>
      <DataTableCell column={createdColumn}>
        <Text style={styles.createdText} numberOfLines={1}>
          {formatLocalDateTime(row.createdAt, { includeSeconds: false })}
        </Text>
      </DataTableCell>
      <DataTableCell column={deleteColumn}>
        <PendingKeyDeleteControl
          row={row}
          confirming={confirming}
          deleting={deleting}
          onRequestConfirm={onRequestConfirm}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </DataTableCell>
    </DataTableRow>
  )
}

function PendingKeysTable({
  rows,
  confirmingId,
  deletingId,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Readonly<{
  rows: readonly LicenseRecord[]
  confirmingId: string | null
  deletingId: string | null
  onRequestConfirm: (id: string) => void
  onCancel: () => void
  onConfirm: (id: string) => void
}>) {
  return (
    <DataTable columns={PENDING_KEY_COLUMNS} minWidth={520}>
      {rows.map((row, index) => (
        <PendingKeyRow
          key={row.id}
          row={row}
          rowIndex={index}
          confirming={confirmingId === row.id}
          deleting={deletingId === row.id}
          onRequestConfirm={() => onRequestConfirm(row.id)}
          onCancel={onCancel}
          onConfirm={() => onConfirm(row.id)}
        />
      ))}
    </DataTable>
  )
}

export function PendingKeysSection({ orgId }: Readonly<{ orgId: string }>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const licensesQuery = useOrgLicenses(orgId, { enabled: canOwn })
  const deleteMutation = useDeleteLicense(orgId)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const rows = unboundPendingKeys(licensesQuery.data?.licenses ?? [])
  const loading = licensesQuery.isLoading && rows.length === 0
  let queryError: string | null = null
  if (licensesQuery.isError) {
    queryError =
      licensesQuery.error instanceof Error
        ? licensesQuery.error.message
        : 'Failed to load registration keys'
  }
  const displayError = deleteError ?? deleteMutation.actionError ?? queryError

  usePullToRefresh(async () => {
    if (canOwn) await licensesQuery.refetch()
  })

  const deletingId =
    deleteMutation.isPending && typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null

  const onConfirmDelete = (id: string) => {
    setDeleteError(null)
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setConfirmingId(null)
      },
      onError: (err) => {
        setDeleteError(
          err instanceof Error ? err.message : 'Failed to delete registration key',
        )
      },
    })
  }

  if (!canOwn) {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.pageTitle}>Pending keys</Text>
        <Text style={panelStyles.pageCopy}>
          Only organization owners can view unused registration keys.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Pending keys</Text>
      <Text style={panelStyles.pageCopy}>
        Registration keys that have not enrolled a host yet. Delete a key if you
        no longer need it — the install command cannot be recovered after you
        leave Add server.
      </Text>

      {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}

      <SectionPanel title="Unused keys" hint={pendingKeysHint(loading, rows.length)}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={panelStyles.muted}>Loading keys…</Text>
          </View>
        ) : null}

        {!loading && rows.length === 0 ? (
          <Text style={panelStyles.muted}>
            No unused registration keys. Keys appear here after you add a server,
            until a host connects.
          </Text>
        ) : null}

        {rows.length > 0 ? (
          <PendingKeysTable
            rows={rows}
            confirmingId={confirmingId}
            deletingId={deletingId}
            onRequestConfirm={(id) => {
              setDeleteError(null)
              setConfirmingId(id)
            }}
            onCancel={() => setConfirmingId(null)}
            onConfirm={onConfirmDelete}
          />
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  createdText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  deleteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  deleteBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.88,
  },
})
