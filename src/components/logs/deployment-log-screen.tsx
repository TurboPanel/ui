import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { LogViewer } from '@/components/logs/log-viewer'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { RunningDeployNotice } from '@/components/org/project/environment-deployment-history-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  EmptyState,
  LoadingState,
  SegmentedControl,
  StatusDot,
  type StatusTone,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { commandErrorDetail, commandErrorLine } from '@/lib/command-error'
import { liveProgressHeadline, stepsOf } from '@/lib/deploy-progress'
import {
  cancelledDeploymentNote,
  cancelTooLateNote,
  deploymentServerLabel,
  deploymentGroupTone,
  deploymentStrategyLabel,
  formatDeployActor,
  formatDeployDuration,
  formatDeployTimestamp,
  formatDeployTrigger,
  groupDeploymentsByGeneration,
  isDeploymentInFlight,
  stalledDeploymentHint,
  type DeploymentGroup,
} from '@/lib/deployment-history'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import { liveState, nextLivePaused, shouldPollLog } from '@/lib/log-viewer'
import { isManagedProject, projectEnvironmentDeploymentsHref } from '@/lib/project-navigation'
import { isTerminalCommandStatus, useCommandsBatch } from '@/lib/queries/commands'
import { useCommandLog, useEnvironmentDeployments } from '@/lib/queries/execution-logs'
import { queryKeys } from '@/lib/query-keys'
import { colors, spacing, webPointer } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'
import { fontFamily } from '@/lib/v4/typography'

const WEB = Platform.OS === 'web'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function statusDotTone(tone: 'success' | 'failed' | 'pending'): StatusTone {
  if (tone === 'success') return 'online'
  if (tone === 'failed') return 'failed'
  return 'pending'
}

/** The one line that says why this host's deploy failed, or null. */
function failureLine(row: DeploymentHistoryRecord): string | null {
  return row.strategyOutcomeReason ?? commandErrorLine(row)
}

/** The deploy a path names: its anchor id, or any host's command id in it. */
function findDeployment(
  groups: readonly DeploymentGroup[],
  deploymentId: string
): DeploymentGroup | null {
  return (
    groups.find((group) => group.id === deploymentId) ??
    groups.find((group) => group.commands.some((row) => row.commandId === deploymentId)) ??
    null
  )
}

/** The whole failure text behind the one-line cause, folded until asked for. */
function FailureDetail({ text }: Readonly<{ text: string }>) {
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.failureDetail}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={webPointer}
      >
        <Text style={panelStyles.muted}>{open ? 'Hide full error' : 'Show full error'}</Text>
      </Pressable>
      {open ? (
        <Text selectable style={[panelStyles.muted, styles.mono]}>
          {text}
        </Text>
      ) : null}
    </View>
  )
}

/** Notes about how this host's attempt ended: the failure, a cancel, a stall. */
function DeploymentNotes({
  group,
  row,
}: Readonly<{ group: DeploymentGroup; row: DeploymentHistoryRecord }>) {
  const cancelledNote = cancelledDeploymentNote(group)
  // A cancelled deploy is not an error: say what happened in plain words.
  const failure = cancelledNote ? null : failureLine(row)
  const failureDetail =
    !cancelledNote && !row.strategyOutcomeReason ? commandErrorDetail(row) : null
  const tooLate = cancelTooLateNote(group)
  const stalledHint = stalledDeploymentHint(row.errorCode ?? null)
  const strategy = deploymentStrategyLabel(row.strategy)
  return (
    <>
      {failure ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {failure}
        </Text>
      ) : null}
      {failureDetail ? <FailureDetail text={failureDetail} /> : null}
      {cancelledNote ? <Text style={panelStyles.muted}>{cancelledNote}</Text> : null}
      {tooLate ? <Text style={panelStyles.muted}>{tooLate}</Text> : null}
      {stalledHint ? <Text style={panelStyles.muted}>{stalledHint}</Text> : null}
      {strategy ? <Text style={panelStyles.muted}>{`${strategy} deploy`}</Text> : null}
    </>
  )
}

function liveHint(running: boolean, paused: boolean): string {
  if (!running) return 'Live is off because this deploy has finished.'
  if (paused) return 'Live is paused. Switch it back on to follow new output.'
  return 'Live: new lines appear as they arrive. Scrolling up pauses it.'
}

/**
 * One host's log for a deploy. The command's status and step plan come from
 * the status poll (it stops once the deploy ends); the transcript reads on
 * while Live is on.
 */
function DeploymentHostLog({
  orgId,
  environmentId,
  row,
}: Readonly<{ orgId: string; environmentId: string; row: DeploymentHistoryRecord }>) {
  const queryClient = useQueryClient()
  const entries = useMemo(
    () => [{ serverId: row.serverId, commandId: row.commandId }],
    [row.serverId, row.commandId]
  )
  const record = useCommandsBatch(orgId, entries).data?.find((item) => item.id === row.commandId)
  const status = record?.status ?? row.status
  const running = !isTerminalCommandStatus(status)
  const [openedFinished] = useState(() => isTerminalCommandStatus(row.status))
  const [paused, setPaused] = useState(false)
  const log = useCommandLog(orgId, row.serverId, row.commandId, {
    poll: shouldPollLog({ running, paused, openedFinished }),
  })
  const plan = useMemo(() => stepsOf(record?.progress), [record?.progress])
  const headline = liveProgressHeadline(record?.progress, !running)

  // When the deploy ends here, the history row's status and duration catch up.
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) {
      setPaused((current) => nextLivePaused(current, 'finished'))
      queryClient
        .invalidateQueries({
          queryKey: queryKeys.org(orgId).environments.deployments(environmentId),
        })
        .catch(() => {
          // A failed refresh leaves the cached row; the next visit reads it again.
        })
    }
    wasRunning.current = running
  }, [environmentId, orgId, queryClient, running])

  if (!row.hasLog && !running) {
    return (
      <EmptyState
        panel
        title="No log kept"
        hint="This attempt ran before deploy logs were kept, or its log is past the time TurboPanel keeps logs."
      />
    )
  }

  const live = liveState(running && !log.snapshot.sealed, paused)
  return (
    <View style={styles.hostLog}>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      <LogViewer
        lines={log.snapshot.lines}
        state={log.state}
        plan={plan.length > 0 ? plan : null}
        commandStatus={status}
        live={live}
        onLiveToggle={() => setPaused((current) => nextLivePaused(current, 'toggle'))}
        onScrolledAway={() => setPaused((current) => nextLivePaused(current, 'scrolled-away'))}
        hint={liveHint(live !== 'off', live === 'paused')}
        downloadFileName={`deploy-${row.commandId}.log`}
      />
    </View>
  )
}

function DeploymentHeader({ group }: Readonly<{ group: DeploymentGroup }>) {
  const tone = deploymentGroupTone(group)
  const trigger = formatDeployTrigger(group.trigger)
  const meta = [
    trigger?.headline ?? formatDeployActor(group.actorEntityType),
    trigger?.detail ?? null,
    group.durationMs === null ? null : formatDeployDuration(group.durationMs),
    group.commands.length > 1 ? `${group.commands.length} hosts` : null,
  ].filter((part): part is string => Boolean(part))
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {`Deploy ${formatDeployTimestamp(group.startedAt)}`}
        </Text>
        <View style={styles.status}>
          <StatusDot size="sm" tone={statusDotTone(tone.tone)} />
          <Text style={styles.statusText}>{tone.label}</Text>
        </View>
      </View>
      <Text style={styles.meta}>{meta.join(' · ')}</Text>
    </View>
  )
}

function DeploymentLog({
  orgId,
  environmentId,
  group,
  initialCommandId,
  canManage,
}: Readonly<{
  orgId: string
  environmentId: string
  group: DeploymentGroup
  initialCommandId: string
  canManage: boolean
}>) {
  const [serverId, setServerId] = useState<string>(
    () =>
      group.commands.find((row) => row.commandId === initialCommandId)?.serverId ??
      group.commands[0]?.serverId ??
      ''
  )
  const active = group.commands.find((row) => row.serverId === serverId) ?? group.commands[0]
  return (
    <View style={styles.body}>
      <DeploymentHeader group={group} />
      {isDeploymentInFlight(group.commands) ? (
        <RunningDeployNotice
          orgId={orgId}
          environmentId={environmentId}
          group={group}
          canManage={canManage}
        />
      ) : null}
      {group.commands.length > 1 ? (
        <SegmentedControl
          options={group.commands.map((row) => ({
            value: row.serverId,
            label: deploymentServerLabel(row),
          }))}
          value={active?.serverId ?? ''}
          onChange={setServerId}
          accessibilityLabel="Server"
        />
      ) : null}
      {active ? <DeploymentNotes group={group} row={active} /> : null}
      {active ? (
        <DeploymentHostLog
          key={active.commandId}
          orgId={orgId}
          environmentId={environmentId}
          row={active}
        />
      ) : null}
    </View>
  )
}

// The child of `Link asChild` takes one style object, never an array (web).
const backStyle = {
  alignSelf: 'flex-start',
  minHeight: 44,
  justifyContent: 'center',
  ...webPointer,
} as const

function BackToDeployments({ href }: Readonly<{ href: string }>) {
  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link" style={backStyle}>
        <Text style={styles.backText}>‹ Deployments</Text>
      </Pressable>
    </Link>
  )
}

/**
 * One deploy's full log (`/environments/:environmentId/deployments/:deploymentId`).
 * The deploy is read from the environment's history; the path id is the
 * deploy's anchor command id or any of its hosts' command ids.
 */
export function DeploymentLogScreen() {
  const params = useLocalSearchParams<{ deploymentId: string | string[] }>()
  const deploymentId = firstParam(params.deploymentId)
  const { orgId, projectId, project, pathEnvironmentId, canManage } = useProjectContext()
  const environmentId = pathEnvironmentId ?? ''
  const managed = project != null && isManagedProject(project)
  const deployments = useEnvironmentDeployments(orgId, environmentId, {
    enabled: !managed && environmentId.length > 0,
  })
  const groups = useMemo(
    () => groupDeploymentsByGeneration(deployments.data?.deployments ?? []),
    [deployments.data?.deployments]
  )

  if (managed) return <ManagedFocusTab focus="overview" />
  // This route always names an environment, but on a direct link the router's
  // path can still read the project's own path on the first render, while the
  // project loads. Wait for it: leaving here would drop the link.
  // A path naming an environment that is gone is EnvironmentShell's to handle.
  if (!pathEnvironmentId) return null

  const backHref = projectEnvironmentDeploymentsHref(orgId, projectId, environmentId)
  const group = findDeployment(groups, deploymentId)
  let content
  if (deployments.isLoading) {
    content = <LoadingState label="Loading the deploy…" />
  } else if (deployments.error) {
    content = (
      <Text style={panelStyles.error}>
        {userErrorMessage(deployments.error, 'Could not load this deploy')}
      </Text>
    )
  } else if (group) {
    content = (
      <DeploymentLog
        key={group.id}
        orgId={orgId}
        environmentId={environmentId}
        group={group}
        initialCommandId={deploymentId}
        canManage={canManage}
      />
    )
  } else {
    content = (
      <EmptyState
        panel
        title="Deploy not found"
        hint="This deploy is not in the environment's recent history. Go back to Deployments to pick one."
      />
    )
  }

  return (
    <View style={styles.screen}>
      <BackToDeployments href={backHref} />
      {content}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md,
    minWidth: 0,
  },
  body: {
    gap: spacing.md,
    minWidth: 0,
  },
  backText: {
    color: colors.command,
    fontFamily: fontFamily('bodySemibold', WEB),
    fontSize: 14,
  },
  header: {
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.textTitle,
    fontFamily: fontFamily('display', WEB),
    fontSize: 20,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: colors.textBody,
    fontFamily: fontFamily('bodySemibold', WEB),
    fontSize: 13,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fontFamily('mono', WEB),
    fontSize: 12,
  },
  headline: {
    color: colors.textBody,
    fontFamily: fontFamily('bodyMedium', WEB),
    fontSize: 13,
  },
  hostLog: {
    gap: spacing.sm,
    minWidth: 0,
  },
  failureDetail: {
    gap: spacing.xs,
  },
  mono: {
    fontFamily: fontFamily('mono', WEB),
  },
})
