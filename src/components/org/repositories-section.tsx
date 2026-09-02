import { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmButton,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  InlineNotice,
  MonoText,
  SectionPanel,
} from '@/components/ui'
import {
  REPOSITORY_AUTO_DEPLOY_OPTIONS,
  REPOSITORY_REFERENCED_BY_COMPOSE_ERROR,
  type GitConnectionRecord,
  type RepositoryRecord,
} from '@/lib/instance-api'
import {
  repositoryLabel,
  repositoryProviderLabel,
} from '@/lib/repository-label'
import {
  repositoryAuthLane,
  repositoryBranchDisplay,
  repositoryUsageIndex,
  repositoryUsageLabel,
} from '@/lib/repository-usage'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useProjects } from '@/lib/queries/projects'
import {
  useDeleteRepository,
  useGitConnections,
  useRefreshRepository,
  useRepositories,
} from '@/lib/queries/releases'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const AUTH_LANE_TONES: Record<string, BadgeTone> = {
  connection: 'ok',
  deploy_key: 'info',
  anonymous: 'muted',
}

function autoDeployLabel(row: RepositoryRecord): string {
  return (
    REPOSITORY_AUTO_DEPLOY_OPTIONS.find((entry) => entry.value === row.autoDeploy)
      ?.label ?? row.autoDeploy
  )
}

function deleteErrorMessage(code: string): string {
  if (code === REPOSITORY_REFERENCED_BY_COMPOSE_ERROR) {
    return 'A service still builds from this repository — detach it from the ' +
      'service (or delete the project) first.'
  }
  return code
}

const REPOSITORY_COLUMNS = [
  { key: 'repository', header: 'Repository', flex: 2.4, minWidth: 240 },
  { key: 'source', header: 'Source', flex: 0.9, minWidth: 100 },
  { key: 'auth', header: 'Access', flex: 1.1, minWidth: 110 },
  { key: 'branch', header: 'Branch', flex: 1.1, minWidth: 110 },
  { key: 'autoDeploy', header: 'Auto-deploy', flex: 1.2, minWidth: 130 },
  { key: 'usedBy', header: 'Used by', flex: 1.4, minWidth: 130 },
  { key: 'actions', header: 'Actions', flex: 1.8, minWidth: 200, align: 'end' },
] as const satisfies readonly DataTableColumn[]

function RepositoryRow({
  row,
  rowIndex,
  connections,
  usedBy,
  canManage,
  refreshing,
  deleting,
  onRefresh,
  onDelete,
}: Readonly<{
  row: RepositoryRecord
  rowIndex: number
  connections: readonly GitConnectionRecord[]
  usedBy: readonly string[]
  canManage: boolean
  refreshing: boolean
  deleting: boolean
  onRefresh: () => void
  onDelete: () => void
}>) {
  const [
    repositoryColumn,
    sourceColumn,
    authColumn,
    branchColumn,
    autoDeployColumn,
    usedByColumn,
    actionsColumn,
  ] = REPOSITORY_COLUMNS

  const lane = repositoryAuthLane(row, connections)
  const branch = repositoryBranchDisplay(row)
  const used = usedBy.length > 0

  return (
    <DataTableRow alt={rowIndex % 2 === 1}>
      <DataTableCell column={repositoryColumn}>
        <View style={styles.repositoryCell}>
          <Text style={styles.nameText} numberOfLines={1}>
            {repositoryLabel(row)}
          </Text>
          <MonoText style={styles.urlText} numberOfLines={1}>
            {row.repositoryUrl}
          </MonoText>
        </View>
      </DataTableCell>
      <DataTableCell column={sourceColumn}>
        <Badge label={repositoryProviderLabel(row)} />
      </DataTableCell>
      <DataTableCell column={authColumn}>
        <Badge label={lane.label} tone={AUTH_LANE_TONES[lane.kind] ?? 'muted'} />
      </DataTableCell>
      <DataTableCell column={branchColumn}>
        <View style={styles.branchCell}>
          <Text style={styles.branchText} numberOfLines={1}>
            {branch.branch ?? '—'}
          </Text>
          {branch.detectedDiffers
            ? (
              <Text style={styles.branchDrift} numberOfLines={1}>
                provider: {branch.detectedDiffers}
              </Text>
            )
            : null}
        </View>
      </DataTableCell>
      <DataTableCell column={autoDeployColumn}>
        <Text style={styles.mutedText} numberOfLines={1}>
          {autoDeployLabel(row)}
        </Text>
      </DataTableCell>
      <DataTableCell column={usedByColumn}>
        <Text
          style={used ? styles.usedByText : styles.mutedText}
          numberOfLines={2}
        >
          {repositoryUsageLabel(usedBy)}
        </Text>
      </DataTableCell>
      <DataTableCell column={actionsColumn}>
        <View style={styles.actionsCell}>
          {row.connectionId
            ? (
              <Button
                label="Refresh"
                busyLabel="Refreshing…"
                variant="ghost"
                size="sm"
                busy={refreshing}
                disabled={!canManage || deleting}
                onPress={onRefresh}
              />
            )
            : null}
          {used
            ? <Text style={panelStyles.muted}>In use</Text>
            : (
              <ConfirmButton
                label="Delete"
                confirmLabel="Confirm delete"
                prompt="Disconnect this repository?"
                busy={deleting}
                disabled={!canManage || refreshing}
                onConfirm={onDelete}
              />
            )}
        </View>
      </DataTableCell>
    </DataTableRow>
  )
}

/**
 * The organization's connected Git repositories — one row per repository.
 *
 * Rows are created implicitly (a project flow attaches one, or an operator
 * pastes a clone URL) and deduplicated per organization by canonical URL, so
 * this screen is the ledger of what accumulated: which lane authenticates each
 * clone, which branch deploys track, what still uses the row, and the delete
 * for anything nothing references. Repositories are still *attached* from the
 * project flows — there is deliberately no "add repository" form here, because
 * a row that nothing references is exactly what this screen exists to clean up.
 *
 * Deleting is offered only for unused rows; the count comes from
 * `project.repositoryId` on the projects list, and the server's 409
 * (`source_referenced_by_compose`) stays authoritative for compose references
 * the column misses.
 */
/** `repositoriesQuery.isError` case, unwrapped to a message worth showing. */
function resolveQueryError(isError: boolean, error: unknown): string | null {
  if (!isError) return null
  return error instanceof Error ? error.message : 'Failed to load repositories'
}

/** The row id a mutation is in flight for, so its own row can show a spinner. */
function pendingRowId(isPending: boolean, variables: unknown): string | null {
  return isPending && typeof variables === 'string' ? variables : null
}

export function RepositoriesSection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const repositoriesQuery = useRepositories(orgId)
  const connectionsQuery = useGitConnections(orgId)
  const projectsQuery = useProjects(orgId)
  const refreshMutation = useRefreshRepository(orgId)
  const deleteMutation = useDeleteRepository(orgId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)

  const rows = repositoriesQuery.data?.repositories ?? []
  const connections = connectionsQuery.data?.connections ?? []
  const usage = useMemo(
    () => repositoryUsageIndex(projectsQuery.data?.projects ?? []),
    [projectsQuery.data?.projects],
  )

  usePullToRefresh(async () => {
    await Promise.all([repositoriesQuery.refetch(), projectsQuery.refetch()])
  })

  const loading = repositoriesQuery.isLoading && rows.length === 0
  const queryError = resolveQueryError(
    repositoriesQuery.isError,
    repositoriesQuery.error,
  )

  const refreshingId = pendingRowId(
    refreshMutation.isPending,
    refreshMutation.variables,
  )
  const deletingId = pendingRowId(
    deleteMutation.isPending,
    deleteMutation.variables,
  )

  const onRefresh = async (row: RepositoryRecord) => {
    setActionError(null)
    setRefreshNote(null)
    const result = await refreshMutation.run(row.id)
    if (!result.ok) {
      setActionError(result.error ?? 'Failed to refresh repository')
      return
    }
    const refreshed = result.value.repository
    setRefreshNote(
      `${repositoryLabel(refreshed)} — default branch ${
        refreshed.metadata?.detectedDefaultBranch ?? 'not reported'
      }.`,
    )
  }

  const onDelete = async (row: RepositoryRecord) => {
    setActionError(null)
    setRefreshNote(null)
    const result = await deleteMutation.run(row.id)
    if (!result.ok) {
      setActionError(deleteErrorMessage(result.error ?? 'Failed to disconnect'))
    }
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Repositories</Text>
      <Text style={panelStyles.pageCopy}>
        Git repositories connected to this organization — one row per
        repository, however many projects build from it. Attach one while
        creating or editing a project; delete rows nothing uses any more.
      </Text>

      {queryError ? <Text style={panelStyles.error}>{queryError}</Text> : null}
      {actionError
        ? <InlineNotice tone="warning" title="Action failed" body={actionError} />
        : null}
      {refreshNote
        ? <InlineNotice title="Refreshed from the provider" body={refreshNote} />
        : null}

      <SectionPanel
        title="Connected repositories"
        hint={loading ? 'Loading…' : `${rows.length} connected`}
      >
        {loading
          ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={panelStyles.muted}>Loading repositories…</Text>
            </View>
          )
          : null}

        {!loading && rows.length === 0
          ? (
            <Text style={panelStyles.muted}>
              No repositories yet. One appears here the first time a project
              attaches a repository or you connect a clone URL.
            </Text>
          )
          : null}

        {rows.length > 0
          ? (
            <DataTable columns={REPOSITORY_COLUMNS} minWidth={1020}>
              {rows.map((row, index) => (
                <RepositoryRow
                  key={row.id}
                  row={row}
                  rowIndex={index}
                  connections={connections}
                  usedBy={usage.get(row.id) ?? []}
                  canManage={canManage}
                  refreshing={refreshingId === row.id}
                  deleting={deletingId === row.id}
                  onRefresh={() => void onRefresh(row)}
                  onDelete={() => void onDelete(row)}
                />
              ))}
            </DataTable>
          )
          : null}
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
  repositoryCell: {
    gap: 2,
    minWidth: 0,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  urlText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  branchCell: {
    gap: 2,
    minWidth: 0,
  },
  branchText: {
    color: colors.textBody,
    fontSize: 13,
  },
  branchDrift: {
    color: colors.pending,
    fontSize: 12,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  usedByText: {
    color: colors.textBody,
    fontSize: 13,
  },
  actionsCell: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
