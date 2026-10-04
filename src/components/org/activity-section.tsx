import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  SectionPanel,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  activityActionLabel,
  activityRangeLabel,
  activityStateLabel,
  activityStateTone,
  activityTargetLabel,
} from '@/lib/activity'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { formatDurationSeconds } from '@/lib/format-metrics'
import type { OrganizationActivityFilter, OrganizationActivityItem } from '@/lib/instance-api'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { ACTIVITY_PAGE_SIZE, useOrganizationActivity } from '@/lib/queries/activity'
import { useCan } from '@/lib/query-client'
import { colors, spacing, webPointer } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const FILTERS: readonly { id: OrganizationActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deploying', label: 'In progress' },
  { id: 'failed', label: 'Failed' },
]

const COLUMNS = [
  { key: 'target', header: 'Project / environment', flex: 2, minWidth: 180 },
  { key: 'action', header: 'Action', flex: 0.9, minWidth: 90 },
  { key: 'state', header: 'State', flex: 1, minWidth: 110 },
  { key: 'started', header: 'Started', flex: 1.4, minWidth: 150 },
  { key: 'duration', header: 'Duration', flex: 0.8, minWidth: 80 },
  { key: 'detail', header: 'Detail', flex: 2, minWidth: 180 },
] as const satisfies readonly DataTableColumn[]

function ActivityRow({
  item,
  rowIndex,
}: Readonly<{ item: OrganizationActivityItem; rowIndex: number }>) {
  const [target, action, state, started, duration, detail] = COLUMNS
  return (
    <DataTableRow alt={rowIndex % 2 === 1}>
      <DataTableCell column={target}>
        <Text style={styles.primaryText} numberOfLines={1}>
          {activityTargetLabel(item)}
        </Text>
      </DataTableCell>
      <DataTableCell column={action}>
        <Text style={styles.mutedText}>{activityActionLabel(item.action)}</Text>
      </DataTableCell>
      <DataTableCell column={state}>
        <Badge label={activityStateLabel(item.state)} tone={activityStateTone(item.state)} />
      </DataTableCell>
      <DataTableCell column={started}>
        <Text style={styles.mutedText} numberOfLines={1}>
          {formatLocalDateTime(item.startedAt, { includeSeconds: false })}
        </Text>
      </DataTableCell>
      <DataTableCell column={duration}>
        <Text style={styles.mutedText}>{formatDurationSeconds(item.durationSecs)}</Text>
      </DataTableCell>
      <DataTableCell column={detail}>
        <Text style={styles.mutedText} numberOfLines={2}>
          {item.errorMessage ?? '—'}
        </Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function FilterButton({
  label,
  active,
  onPress,
}: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Show ${label}`}
      style={({ pressed }) => [
        active ? panelStyles.toolbarBtnPrimary : panelStyles.toolbarBtnSecondary,
        pressed && styles.pressed,
        webPointer,
      ]}
      onPress={onPress}
    >
      <Text style={active ? panelStyles.toolbarBtnTextPrimary : panelStyles.toolbarBtnTextSecondary}>
        {label}
      </Text>
    </Pressable>
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

/** Org Activity: running and recently failed deploys, restarts and stops, refreshed by polling. */
export function ActivitySection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [filter, setFilter] = useState<OrganizationActivityFilter>('all')
  const [offset, setOffset] = useState(0)
  const activity = useOrganizationActivity(orgId, { filter, offset }, { enabled: canManage })

  usePullToRefresh(async () => {
    if (canManage) await activity.refetch()
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
  const error = activity.isError ? userErrorMessage(activity.error, 'Failed to load activity') : null

  const chooseFilter = (next: OrganizationActivityFilter) => {
    setFilter(next)
    setOffset(0)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Activity</Text>
      <Text style={panelStyles.pageCopy}>
        Deploys, restarts and stops that are running now, and those that failed in the last 7 days,
        across every project. This page refreshes on its own.
      </Text>

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <View style={styles.filters}>
        {FILTERS.map((entry) => (
          <FilterButton
            key={entry.id}
            label={entry.label}
            active={filter === entry.id}
            onPress={() => chooseFilter(entry.id)}
          />
        ))}
      </View>

      <SectionPanel title="Activity" hint={loading ? 'Loading…' : activityRangeLabel(offset, items.length, total)}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={panelStyles.muted}>Loading activity…</Text>
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <Text style={panelStyles.muted}>Nothing running or failed right now.</Text>
        ) : null}

        {items.length > 0 ? (
          <DataTable columns={COLUMNS} minWidth={820}>
            {items.map((item, index) => (
              <ActivityRow key={item.id} item={item} rowIndex={index} />
            ))}
          </DataTable>
        ) : null}

        {total > ACTIVITY_PAGE_SIZE ? (
          <View style={styles.pager}>
            <PagerButton
              label="Previous"
              disabled={offset === 0}
              onPress={() => setOffset(Math.max(0, offset - ACTIVITY_PAGE_SIZE))}
            />
            <PagerButton
              label="Next"
              disabled={!activity.data?.hasMore}
              onPress={() => setOffset(offset + ACTIVITY_PAGE_SIZE)}
            />
          </View>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pager: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  primaryText: { color: colors.textTitle, fontSize: 14, fontWeight: '600' },
  mutedText: { color: colors.textMuted, fontSize: 13 },
  pressed: { opacity: 0.88 },
})
