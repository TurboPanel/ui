import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SegmentedControl, TextField } from '@/components/ui'
import {
  CONTAINER_LOG_RANGE_IDS,
  CONTAINER_LOG_RANGE_LABELS,
  type ContainerLogFilterDraft,
  type ContainerLogRangeId,
  type ContainerLogStreamFilter,
  type ContainerLogTimeWindow,
} from '@/lib/container-log-query'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { useEnvironments } from '@/lib/queries/environments'
import { useOrgServers } from '@/lib/queries/servers'
import { useServices } from '@/lib/queries/services'
import { colors, spacing } from '@/lib/theme'

const STREAM_OPTIONS = [
  { value: 'all', label: 'All output' },
  { value: 'stdout', label: 'stdout' },
  { value: 'stderr', label: 'stderr' },
] as const satisfies readonly {
  value: ContainerLogStreamFilter
  label: string
}[]

type ChipOption = Readonly<{ id: string; label: string }>

/**
 * One predicate as a wrapping chip row.
 *
 * A chip row rather than a dropdown because every one of these is a *closed*
 * predicate with a small candidate set, and because the whole point of the bar
 * is that the composed query is readable at a glance — a stack of collapsed
 * selects hides what is actually being asked.
 */
function FilterChipRow({
  label,
  options,
  value,
  allLabel,
  disabled = false,
  onSelect,
}: Readonly<{
  label: string
  options: readonly ChipOption[]
  value: string | null
  allLabel: string
  disabled?: boolean
  onSelect: (id: string | null) => void
}>) {
  if (options.length === 0) return null
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {[{ id: '', label: allLabel }, ...options].map((option) => {
          const active = (option.id === '' ? null : option.id) === value
          return (
            <Pressable
              key={option.id || 'all'}
              onPress={() => onSelect(option.id === '' ? null : option.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={`${label}: ${option.label}`}
              style={[
                orgPanelStyles.segmentChip,
                webPointer,
                active && orgPanelStyles.segmentChipActive,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function windowLabel(window: ContainerLogTimeWindow): string {
  const from = formatLocalDateTime(window.fromMs, {
    includeSeconds: false,
    timeZoneName: null,
  })
  const to = formatLocalDateTime(window.toMs, {
    includeSeconds: false,
    timeZoneName: null,
  })
  return `${from} – ${to}`
}

/**
 * Filter bar for the container-log explorer.
 *
 * Filters are the **only** way to compose a query: there is no free-text query
 * builder, because the backend predicate set is closed (it is the store's
 * `ORDER BY` prefix) and anything outside it would either be silently dropped
 * or turn into an unbounded scan. See
 * `design-system/turbopanel/pages/container-logs.md`.
 */
export function ContainerLogFilterBar({
  orgId,
  draft,
  window,
  disabled = false,
  onChange,
}: Readonly<{
  orgId: string
  draft: ContainerLogFilterDraft
  window: ContainerLogTimeWindow
  disabled?: boolean
  onChange: (next: ContainerLogFilterDraft) => void
}>) {
  const serversQuery = useOrgServers(orgId)
  const environmentsQuery = useEnvironments(orgId)
  const servicesQuery = useServices(orgId, draft.environmentId ?? undefined)

  const serverOptions = useMemo<ChipOption[]>(
    () =>
      (serversQuery.data?.servers ?? []).map((server) => ({
        id: server.id,
        label: server.name ?? server.hostname ?? server.id.slice(0, 8),
      })),
    [serversQuery.data],
  )

  const environmentOptions = useMemo<ChipOption[]>(
    () =>
      (environmentsQuery.data?.environments ?? []).map((environment) => ({
        id: environment.id,
        label: environment.name ?? environment.id.slice(0, 8),
      })),
    [environmentsQuery.data],
  )

  const serviceOptions = useMemo<ChipOption[]>(
    () =>
      (servicesQuery.data?.services ?? []).map((service) => ({
        id: service.id,
        label:
          service.name ?? service.composeServiceName ?? service.id.slice(0, 8),
      })),
    [servicesQuery.data],
  )

  const patch = (next: Partial<ContainerLogFilterDraft>) =>
    onChange({ ...draft, ...next })

  return (
    <View style={styles.root}>
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Time range</Text>
        <SegmentedControl<ContainerLogRangeId>
          options={CONTAINER_LOG_RANGE_IDS.map((id) => ({
            value: id,
            label: CONTAINER_LOG_RANGE_LABELS[id],
          }))}
          value={draft.rangeId}
          onChange={(rangeId) => patch({ rangeId })}
          disabled={disabled}
          accessibilityLabel="Container log time range"
        />
      </View>

      <Text style={styles.windowLabel} accessibilityRole="text">
        Showing {windowLabel(window)}
      </Text>

      <FilterChipRow
        label="Server"
        allLabel="All servers"
        options={serverOptions}
        value={draft.serverId}
        disabled={disabled}
        onSelect={(serverId) => patch({ serverId })}
      />

      <FilterChipRow
        label="Environment"
        allLabel="All environments"
        options={environmentOptions}
        value={draft.environmentId}
        disabled={disabled}
        // A service belongs to exactly one environment, so narrowing the
        // environment invalidates a service picked under the previous one.
        onSelect={(environmentId) => patch({ environmentId, serviceId: null })}
      />

      <FilterChipRow
        label="Service"
        allLabel="All services"
        options={serviceOptions}
        value={draft.serviceId}
        disabled={disabled}
        onSelect={(serviceId) => patch({ serviceId })}
      />

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Stream</Text>
        <SegmentedControl<ContainerLogStreamFilter>
          options={STREAM_OPTIONS}
          value={draft.stream}
          onChange={(stream) => patch({ stream })}
          disabled={disabled}
          accessibilityLabel="Container log stream"
        />
      </View>

      <TextField
        label="Search"
        hint="Case-insensitive substring match on the line itself."
        value={draft.search}
        onChangeText={(search) => patch({ search })}
        editable={!disabled}
        placeholder="ECONNREFUSED"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search container output"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 86,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flexShrink: 1,
  },
  windowLabel: {
    color: colors.textBody,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.5,
  },
})
