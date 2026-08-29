import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import {
  nestedScrollDomProps,
  webNestedScrollStyle,
} from '@/components/org/logs/nested-scroll'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  EmptyState,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  StatusDot,
  type StatusTone,
} from '@/components/ui'
import {
  deploymentServerLabel,
  deploymentStatusTone,
  formatDeployActor,
  formatDeployDuration,
  formatDeployTimestamp,
  groupDeploymentsByGeneration,
  type DeploymentGroup,
} from '@/lib/deployment-history'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import { isTerminalCommandStatus } from '@/lib/queries/commands'
import {
  useCommandLog,
  useEnvironmentDeployments,
} from '@/lib/queries/execution-logs'
import { colors, spacing, webPointer } from '@/lib/theme'

/** Cap the history table so a long run of deploys scrolls inside the panel. */
const HISTORY_LIST_MAX_HEIGHT = 560

function statusDotTone(tone: 'success' | 'failed' | 'pending'): StatusTone {
  if (tone === 'success') return 'online'
  if (tone === 'failed') return 'failed'
  return 'pending'
}

function StatusCell({
  status,
}: Readonly<{ status: DeploymentGroup['status'] }>) {
  const tone = deploymentStatusTone(status)
  return (
    <View style={styles.statusCell}>
      <StatusDot size="sm" tone={statusDotTone(tone.tone)} />
      <Text style={styles.statusText}>{tone.label}</Text>
    </View>
  )
}

/** Transcript for one host of a deploy fan-out. */
function DeploymentTranscript({
  orgId,
  row,
}: Readonly<{ orgId: string; row: DeploymentHistoryRecord }>) {
  const terminal = isTerminalCommandStatus(row.status)
  const log = useCommandLog(orgId, row.serverId, row.commandId, {
    // A terminal attempt's transcript is already sealed — read it once.
    poll: !terminal,
  })

  if (!row.hasLog && terminal) {
    return (
      <EmptyState
        panel
        title="No transcript retained"
        hint="This attempt ran before execution logs were captured, or its transcript has passed the retention window."
      />
    )
  }

  return (
    <LogTranscriptView
      lines={log.snapshot.lines}
      state={log.state}
      title={deploymentServerLabel(row)}
      downloadFileName={`deploy-${row.commandId}.log`}
    />
  )
}

function DeploymentDetail({
  orgId,
  group,
}: Readonly<{ orgId: string; group: DeploymentGroup }>) {
  const [serverId, setServerId] = useState<string>(
    group.commands[0]?.serverId ?? '',
  )
  const active =
    group.commands.find((row) => row.serverId === serverId) ??
    group.commands[0]
  const failure = active?.errorMessage ?? null

  return (
    <View style={styles.detail}>
      {group.commands.length > 1 ? (
        <SegmentedControl
          options={group.commands.map((row) => ({
            value: row.serverId,
            label: deploymentServerLabel(row),
          }))}
          value={active?.serverId ?? ''}
          onChange={setServerId}
          accessibilityLabel="Deploy target host"
        />
      ) : null}
      {failure ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {failure}
        </Text>
      ) : null}
      {active ? <DeploymentTranscript orgId={orgId} row={active} /> : null}
    </View>
  )
}

function DeploymentRow({
  orgId,
  group,
  index,
  expanded,
  onToggle,
}: Readonly<{
  orgId: string
  group: DeploymentGroup
  index: number
  expanded: boolean
  onToggle: () => void
}>) {
  const firstCommand = group.commands[0]
  let hostLabel = '—'
  if (group.commands.length > 1) {
    hostLabel = `${group.commands.length} hosts`
  } else if (firstCommand) {
    hostLabel = deploymentServerLabel(firstCommand)
  }

  return (
    <View>
      <Pressable
        style={[
          styles.row,
          index % 2 === 1 && styles.rowZebra,
          expanded && styles.rowExpanded,
          webPointer,
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Deploy ${formatDeployTimestamp(group.startedAt)} — ${
          deploymentStatusTone(group.status).label
        }`}
      >
        <View style={[styles.cell, styles.colStatus]}>
          <StatusCell status={group.status} />
        </View>
        <View style={[styles.cell, styles.colWhen]}>
          <Text style={styles.cellText}>
            {formatDeployTimestamp(group.startedAt)}
          </Text>
        </View>
        <View style={[styles.cell, styles.colActor]}>
          <Text style={styles.cellMuted}>
            {formatDeployActor(group.actorEntityType)}
          </Text>
        </View>
        <View style={[styles.cell, styles.colDuration]}>
          <Text style={styles.cellMono}>
            {formatDeployDuration(group.durationMs)}
          </Text>
        </View>
        <View style={[styles.cell, styles.colServer]}>
          <Text style={styles.cellMono}>{hostLabel}</Text>
        </View>
      </Pressable>
      {expanded ? <DeploymentDetail orgId={orgId} group={group} /> : null}
    </View>
  )
}

function HistoryHeader() {
  return (
    <View style={styles.headerRow}>
      <View style={[styles.cell, styles.colStatus]}>
        <Text style={styles.headerText}>Status</Text>
      </View>
      <View style={[styles.cell, styles.colWhen]}>
        <Text style={styles.headerText}>Started</Text>
      </View>
      <View style={[styles.cell, styles.colActor]}>
        <Text style={styles.headerText}>Actor</Text>
      </View>
      <View style={[styles.cell, styles.colDuration]}>
        <Text style={styles.headerText}>Duration</Text>
      </View>
      <View style={[styles.cell, styles.colServer]}>
        <Text style={styles.headerText}>Target</Text>
      </View>
    </View>
  )
}

/**
 * Past deploy attempts for one environment, with the transcript of the expanded
 * row. Multi-host deploys arrive as several rows sharing a generation and are
 * grouped into one deploy with a per-host switcher — no per-row detail fetch.
 * The list never polls: it is invalidated by the deploy mutation and when a
 * tracked command reaches a terminal status.
 */
export function EnvironmentDeploymentHistoryPanel({
  orgId,
  environmentId,
}: Readonly<{ orgId: string; environmentId: string }>) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const deploymentsQuery = useEnvironmentDeployments(orgId, environmentId)
  const groups = useMemo(
    () => groupDeploymentsByGeneration(deploymentsQuery.data?.deployments ?? []),
    [deploymentsQuery.data?.deployments],
  )

  return (
    <SectionPanel
      title="Deployment history"
      hint="Past deploy attempts and their output"
      collapsible
      defaultCollapsed
    >
      {deploymentsQuery.isLoading ? (
        <LoadingState label="Loading deploy history…" />
      ) : null}
      {deploymentsQuery.error ? (
        <Text style={panelStyles.error}>
          {deploymentsQuery.error instanceof Error
            ? deploymentsQuery.error.message
            : 'Failed to load deploy history'}
        </Text>
      ) : null}
      {!deploymentsQuery.isLoading && groups.length === 0 ? (
        <EmptyState title="No deploys yet." />
      ) : null}
      {groups.length > 0 ? (
        <View style={styles.table}>
          <HistoryHeader />
          <ScrollView
            style={[styles.tableBody, webNestedScrollStyle]}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            persistentScrollbar
            indicatorStyle="white"
            {...nestedScrollDomProps}
          >
            {groups.map((group, index) => (
              <DeploymentRow
                key={group.id}
                orgId={orgId}
                group={group}
                index={index}
                expanded={expandedId === group.id}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === group.id ? null : group.id,
                  )
                }
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    overflow: 'hidden',
  },
  tableBody: {
    maxHeight: HISTORY_LIST_MAX_HEIGHT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  headerText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  rowZebra: {
    backgroundColor: colors.bgInset,
  },
  rowExpanded: {
    backgroundColor: colors.bgActive,
  },
  cell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  colStatus: {
    flex: 1.2,
    minWidth: 110,
  },
  colWhen: {
    flex: 1.4,
    minWidth: 130,
  },
  colActor: {
    flex: 1,
    minWidth: 80,
  },
  colDuration: {
    flex: 0.9,
    minWidth: 70,
  },
  colServer: {
    flex: 1.3,
    minWidth: 110,
  },
  cellText: {
    color: colors.textBody,
    fontSize: 13,
  },
  cellMuted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  cellMono: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  statusCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
    backgroundColor: colors.bgArea,
  },
})
