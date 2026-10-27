import { useRouter, type Href } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  SectionPanel,
  SegmentedControl,
  Select,
  type SelectOption,
  TextLink,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  activityActionLabel,
  activityCommitText,
  activityRangeLabel,
  activityStartedByLabel,
  activityStateLabel,
  activityStateTone,
} from '@/lib/activity'
import { activityParamsToUrl, type ActivityView, useActivityView } from '@/lib/activity-params'
import { activityStepText } from '@/lib/deploy-progress'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { formatDurationSeconds } from '@/lib/format-metrics'
import type { OrganizationActivityFilter, OrganizationActivityItem } from '@/lib/instance-api'
import {
  projectEnvironmentDeploymentHref,
  projectEnvironmentHref,
  projectHref,
} from '@/lib/project-navigation'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { ACTIVITY_PAGE_SIZE, useOrganizationActivity } from '@/lib/queries/activity'
import { useEnvironments } from '@/lib/queries/environments'
import { useProjects } from '@/lib/queries/projects'
import { useCan } from '@/lib/query-client'
import { colors, spacing, webPointer } from '@/lib/theme'
import { plainStepFailureMessage, userErrorMessage } from '@/lib/user-error'

const FILTERS: readonly { value: OrganizationActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'deploying', label: 'In progress' },
]

const COLUMNS = [
  { key: 'state', header: 'Status', flex: 1, minWidth: 120 },
  { key: 'project', header: 'Project', flex: 1.2, minWidth: 140 },
  { key: 'environment', header: 'Environment', flex: 1, minWidth: 120 },
  { key: 'action', header: 'Action', flex: 0.7, minWidth: 80 },
  { key: 'change', header: 'Change', flex: 2, minWidth: 200 },
  { key: 'by', header: 'Started By', flex: 1.2, minWidth: 140 },
  { key: 'started', header: 'Started', flex: 1.2, minWidth: 140 },
  { key: 'duration', header: 'Duration', flex: 0.7, minWidth: 80 },
  { key: 'log', header: 'View Log', flex: 0.6, minWidth: 80 },
] as const satisfies readonly DataTableColumn[]

/** What the Change column says: the commit, else the step a running item is on, else why it failed. */
function activityChangeText(item: OrganizationActivityItem): string {
  const commit = activityCommitText(item)
  if (commit) return commit
  if (item.state === 'queued') return 'Waiting for the server to start it'
  if (item.state === 'deploying') {
    return activityStepText(item) ?? plainStepFailureMessage(item.errorMessage) ?? '—'
  }
  return plainStepFailureMessage(item.errorMessage) ?? '—'
}

/** The failure line under a commit, so a failed deploy still says why. */
function activityProblemText(item: OrganizationActivityItem): string | null {
  if (item.state !== 'failed' || !activityCommitText(item)) return null
  return plainStepFailureMessage(item.errorMessage)
}

function NameLink({
  name,
  href,
  fallback,
}: Readonly<{ name: string | null; href: string | null; fallback: string }>) {
  const router = useRouter()
  const label = name?.trim() || fallback
  if (!href) return <Text style={styles.mutedText}>{label}</Text>
  return (
    <TextLink
      label={label}
      size="sm"
      accessibilityLabel={`Open ${label}`}
      onPress={() => router.push(href as Href)}
    />
  )
}

type ItemHrefs = Readonly<{
  project: string | null
  environment: string | null
  log: string | null
}>

function itemHrefs(orgId: string, item: OrganizationActivityItem): ItemHrefs {
  const { projectId, environmentId } = item
  if (!projectId) return { project: null, environment: null, log: null }
  const project = projectHref(orgId, projectId)
  if (!environmentId) return { project, environment: null, log: null }
  return {
    project,
    environment: projectEnvironmentHref(orgId, projectId, environmentId),
    // Only a deploy has a log page of its own.
    log:
      item.action === 'deploy'
        ? projectEnvironmentDeploymentHref(orgId, projectId, environmentId, item.id)
        : null,
  }
}

function ChangeCell({ item }: Readonly<{ item: OrganizationActivityItem }>) {
  const problem = activityProblemText(item)
  return (
    <>
      <Text style={styles.mutedText} numberOfLines={2}>
        {activityChangeText(item)}
      </Text>
      {problem ? (
        <Text style={styles.problemText} numberOfLines={2}>
          {problem}
        </Text>
      ) : null}
    </>
  )
}

function ActivityRow({
  orgId,
  item,
  rowIndex,
}: Readonly<{ orgId: string; item: OrganizationActivityItem; rowIndex: number }>) {
  const [state, project, environment, action, change, by, started, duration, log] = COLUMNS
  const hrefs = itemHrefs(orgId, item)
  return (
    <DataTableRow alt={rowIndex % 2 === 1}>
      <DataTableCell column={state}>
        <Badge
          label={activityStateLabel(item.state, item.action, item.failure)}
          tone={activityStateTone(item.state, item.failure)}
        />
      </DataTableCell>
      <DataTableCell column={project}>
        <NameLink name={item.projectName} href={hrefs.project} fallback="—" />
      </DataTableCell>
      <DataTableCell column={environment}>
        <NameLink name={item.environmentName} href={hrefs.environment} fallback="—" />
      </DataTableCell>
      <DataTableCell column={action}>
        <Text style={styles.mutedText}>{activityActionLabel(item.action)}</Text>
      </DataTableCell>
      <DataTableCell column={change}>
        <ChangeCell item={item} />
      </DataTableCell>
      <DataTableCell column={by}>
        <Text style={styles.mutedText} numberOfLines={1}>
          {activityStartedByLabel(item)}
        </Text>
      </DataTableCell>
      <DataTableCell column={started}>
        <Text style={styles.mutedText} numberOfLines={1}>
          {formatLocalDateTime(item.startedAt, { includeSeconds: false })}
        </Text>
      </DataTableCell>
      <DataTableCell column={duration}>
        <Text style={styles.mutedText}>{formatDurationSeconds(item.durationSecs)}</Text>
      </DataTableCell>
      <DataTableCell column={log}>
        <NameLink name={hrefs.log ? 'View Log' : null} href={hrefs.log} fallback="—" />
      </DataTableCell>
    </DataTableRow>
  )
}

function PagerButton({
  label,
  disabled,
  onPress,
}: Readonly<{ label: string; disabled: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        panelStyles.toolbarBtnSecondary,
        (pressed || disabled) && styles.pressed,
        webPointer,
      ]}
      onPress={onPress}
    >
      <Text style={panelStyles.toolbarBtnTextSecondary}>{label}</Text>
    </Pressable>
  )
}

function namedOptions(
  rows: readonly { id: string; name: string | null }[] | undefined
): SelectOption[] {
  return (rows ?? []).map((row) => ({ value: row.id, label: row.name?.trim() || row.id }))
}

/** Project and environment pickers; the environment list follows the chosen project. */
function PlaceFilters({
  orgId,
  view,
  update,
}: Readonly<{ orgId: string; view: ActivityView; update: (next: Partial<ActivityView>) => void }>) {
  const projects = useProjects(orgId)
  const environments = useEnvironments(orgId, view.projectId, {
    enabled: view.projectId.length > 0,
  })
  return (
    <>
      <View style={styles.picker}>
        <Select
          value={view.projectId || null}
          options={namedOptions(projects.data?.projects)}
          placeholder="All projects"
          noneLabel="All projects"
          accessibilityLabel="Filter by project"
          onChange={(next) => update({ projectId: next ?? '', environmentId: '', offset: 0 })}
        />
      </View>
      {view.projectId ? (
        <View style={styles.picker}>
          <Select
            value={view.environmentId || null}
            options={namedOptions(environments.data?.environments)}
            placeholder="All environments"
            noneLabel="All environments"
            accessibilityLabel="Filter by environment"
            onChange={(next) => update({ environmentId: next ?? '', offset: 0 })}
          />
        </View>
      ) : null}
    </>
  )
}

function emptyText(view: ActivityView): string {
  const filtered = view.filter !== 'all' || view.projectId.length > 0
  return filtered ? 'Nothing matches these filters.' : 'Nothing has been deployed yet.'
}

/**
 * Org Activity: every deploy, restart and stop, newest first, whatever the
 * outcome. Filters and the page live in the URL; the page refreshes on its own.
 */
export function ActivitySection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const router = useRouter()
  const { view, visible } = useActivityView(orgId)
  const update = (next: Partial<ActivityView>) => {
    router.setParams(activityParamsToUrl({ ...view, ...next }))
  }
  const activity = useOrganizationActivity(
    orgId,
    {
      filter: view.filter,
      offset: view.offset,
      projectId: view.projectId || undefined,
      environmentId: view.environmentId || undefined,
    },
    // A pager tab that is not on show (phones) does not poll.
    { enabled: canManage && visible }
  )

  usePullToRefresh(async () => {
    if (canManage && visible) await activity.refetch()
  })

  if (!canManage) {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.pageTitle}>Activity</Text>
        <Text style={panelStyles.pageCopy}>
          Only organization owners and managers can see deploy activity.
        </Text>
      </View>
    )
  }

  const items = activity.data?.items ?? []
  const total = activity.data?.total ?? 0
  const loading = activity.isLoading
  const error = activity.isError
    ? userErrorMessage(activity.error, 'Failed to load activity')
    : null
  const range = activityRangeLabel(view.offset, items.length, total, activity.data?.totalCapped)

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Activity</Text>
      <Text style={panelStyles.pageCopy}>
        Every deploy, restart and stop across the organization, newest first, whether it is running,
        succeeded or failed. This page refreshes on its own.
      </Text>

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <View style={styles.filters}>
        <SegmentedControl
          options={FILTERS}
          value={view.filter}
          accessibilityLabel="Filter by outcome"
          onChange={(filter) => update({ filter, offset: 0 })}
        />
        <PlaceFilters orgId={orgId} view={view} update={update} />
      </View>

      <SectionPanel title="Activity" hint={loading ? 'Loading…' : range}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={panelStyles.muted}>Loading activity…</Text>
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <Text style={panelStyles.muted}>{emptyText(view)}</Text>
        ) : null}

        {items.length > 0 ? (
          <DataTable columns={COLUMNS} minWidth={1200}>
            {items.map((item, index) => (
              <ActivityRow key={item.id} orgId={orgId} item={item} rowIndex={index} />
            ))}
          </DataTable>
        ) : null}

        {view.offset > 0 || activity.data?.hasMore ? (
          <View style={styles.pager}>
            <PagerButton
              label="Previous"
              disabled={view.offset === 0}
              onPress={() => update({ offset: Math.max(0, view.offset - ACTIVITY_PAGE_SIZE) })}
            />
            <PagerButton
              label="Next"
              disabled={!activity.data?.hasMore}
              onPress={() => update({ offset: view.offset + ACTIVITY_PAGE_SIZE })}
            />
          </View>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  picker: { minWidth: 200 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pager: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  problemText: { color: colors.errorText, fontSize: 12 },
  pressed: { opacity: 0.88 },
})
