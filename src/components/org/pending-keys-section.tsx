import { useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
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
import { colors, spacing } from '@/lib/theme'

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
    return <Text style={orgPanelStyles.muted}>Protected</Text>
  }

  if (deleting) {
    return (
      <View style={styles.deleteBusy}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={orgPanelStyles.muted}>Deleting…</Text>
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
            orgPanelStyles.toolbarBtnPrimary,
            pressed && styles.pressed,
            webPointer,
          ]}
          onPress={onConfirm}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Confirm delete</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel delete"
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnSecondary,
            pressed && styles.pressed,
            webPointer,
          ]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete ${title}`}
      style={({ pressed }) => [
        orgPanelStyles.toolbarBtnSecondary,
        pressed && styles.pressed,
        webPointer,
      ]}
      onPress={onRequestConfirm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Delete</Text>
    </Pressable>
  )
}

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

  return (
    <View
      style={[styles.tableRow, rowIndex % 2 === 1 ? styles.tableRowEven : null]}
    >
      <View style={[styles.tableCell, styles.colName]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={[styles.tableCell, styles.colCreated]}>
        <Text style={styles.createdText} numberOfLines={1}>
          {formatLocalDateTime(row.createdAt, { includeSeconds: false })}
        </Text>
      </View>
      <View style={[styles.tableCell, styles.colDelete]}>
        <PendingKeyDeleteControl
          row={row}
          confirming={confirming}
          deleting={deleting}
          onRequestConfirm={onRequestConfirm}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </View>
    </View>
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
    <ScrollView
      horizontal
      style={styles.tableScroll}
      contentContainerStyle={styles.tableScrollContent}
      nestedScrollEnabled
    >
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <View style={[styles.tableCell, styles.colName]}>
            <Text style={styles.tableHeaderText}>Name</Text>
          </View>
          <View style={[styles.tableCell, styles.colCreated]}>
            <Text style={styles.tableHeaderText}>Created</Text>
          </View>
          <View style={[styles.tableCell, styles.colDelete]}>
            <Text style={styles.tableHeaderText}>Delete</Text>
          </View>
        </View>
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
      </View>
    </ScrollView>
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
        <Text style={orgPanelStyles.pageTitle}>Pending keys</Text>
        <Text style={orgPanelStyles.pageCopy}>
          Only organization owners can view unused registration keys.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Pending keys</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Registration keys that have not enrolled a host yet. Delete a key if you
        no longer need it — the install command cannot be recovered after you
        leave Add server.
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      <SectionPanel title="Unused keys" hint={pendingKeysHint(loading, rows.length)}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={orgPanelStyles.muted}>Loading keys…</Text>
          </View>
        ) : null}

        {!loading && rows.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
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
  tableScroll: {
    width: '100%',
    alignSelf: 'stretch',
  },
  tableScrollContent: {
    flexGrow: 1,
    minWidth: '100%',
  },
  table: {
    flexGrow: 1,
    width: '100%',
    minWidth: 520,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    minHeight: 44,
  },
  tableRowEven: {
    backgroundColor: colors.bgInset,
  },
  tableHeaderRow: {
    backgroundColor: colors.bgSecondary,
    paddingVertical: spacing.xs,
    minHeight: 32,
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 2,
        } as unknown as ViewStyle)
      : null),
  },
  tableCell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  tableHeaderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colName: {
    flex: 1.6,
    minWidth: 140,
  },
  colCreated: {
    flex: 1.4,
    minWidth: 160,
  },
  colDelete: {
    flex: 1.4,
    minWidth: 160,
    alignItems: 'flex-end',
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
