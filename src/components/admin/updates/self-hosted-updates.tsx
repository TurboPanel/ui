import { getInstanceRevision, getInstanceVersion } from '@/lib/instance-version'
import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { UpgradeBuildBlock } from '@/components/admin/updates/upgrade-build-block'
import { UpgradeFailureNotice } from '@/components/admin/updates/upgrade-failure-notice'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import {
  RECENT_UPDATE_RUNS,
  UpgradeHistoryPanel,
} from '@/components/admin/updates/upgrade-history-panel'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { UpgradeStepTracker } from '@/components/admin/updates/upgrade-step-tracker'
import { UpdatesStatusPanel } from '@/components/admin/updates/updates-status-panel'
import { Badge, InlineNotice, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  consoleUpdateAvailable,
  selfHostedUpdateAvailable,
  unitUpdateAvailable,
  updatePieceLabel,
  updatePieces,
  type ConsoleBuild,
} from '@/lib/instance-updates'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import {
  fleetProgressText,
  installedBuildLabel,
  offlineWaitingNotice,
  type PieceStepView,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
  upgradeRunErrorLabel,
} from '@/lib/upgrade-display'
import { isUpdateWaiting, waitingSentence } from '@/lib/update-automation'
import {
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import { runFailure, runToShow, stallHint } from '@/lib/update-status'
import { spacing } from '@/lib/theme'

type ShownRun = NonNullable<ReturnType<typeof runToShow>['run']>
type FleetServers = ComponentProps<typeof UpgradeFleetTable>['servers']

/**
 * The clock the "still waiting" hint reads. It re-reads while a run is active
 * so the hint appears without a new poll result.
 */
function useStallClock(run: ShownRun | null, finished: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!run || finished) return undefined
    const timer = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [run, finished])
  return nowMs
}

function ComponentsPanel({
  units,
  consoleBuild,
  channel,
  daemonStep,
  controlPlaneStep,
}: Readonly<{
  units: InstanceUpdates['units']
  daemonStep?: PieceStepView | null
  controlPlaneStep?: PieceStepView | null
  consoleBuild: ConsoleBuild | null
  /** The instance-wide update channel; on `release` the version is the whole story. */
  channel: string
}>) {
  const { instance, daemon } = units
  const hideCommit = { hideCommit: channel.trim().toLowerCase() === 'release' }
  return (
    <SectionPanel title="Versions">
      <UpgradeBuildBlock
        title="Control Plane"
        target={instance.target}
        installedLabel={installedBuildLabel(instance.installed, instance.target, hideCommit)}
        updateAvailable={unitUpdateAvailable(instance)}
        running={instance.installed}
        step={controlPlaneStep}
      />
      <UpgradeBuildBlock
        title="Web Interface"
        target={instance.uiTarget}
        installedLabel={installedBuildLabel(consoleBuild, instance.uiTarget, hideCommit)}
        updateAvailable={consoleUpdateAvailable(consoleBuild, instance.uiTarget)}
        running={consoleBuild}
        step={controlPlaneStep}
      />
      <UpgradeBuildBlock
        title="Co-located Daemon"
        target={daemon.target}
        installedLabel={
          daemon.installed
            ? installedBuildLabel(daemon.installed, daemon.target, hideCommit)
            : 'Not connected'
        }
        updateAvailable={daemon.connected ? unitUpdateAvailable(daemon) : null}
        running={daemon.installed}
        step={daemonStep}
      />
    </SectionPanel>
  )
}

function UpgradeProgressPanel({
  run,
  hasUiTarget,
  fleetSummary,
  fleetServers,
  fleetTotal,
  offset,
  onOffsetChange,
}: Readonly<{
  run: ShownRun | null
  hasUiTarget: boolean
  fleetSummary: ReturnType<typeof summarizeFleetSteps>
  fleetServers: FleetServers
  fleetTotal: number
  offset: number
  onOffsetChange: (offset: number) => void
}>) {
  const daemonStep = run?.steps.find((step) => step.phase === 'colocated_daemon')
  const controlPlaneStep = run?.steps.find((step) => step.phase === 'control_plane')
  const runError = upgradeRunErrorLabel(run?.error)
  const waitingOffline = offlineWaitingNotice(run?.steps ?? [])

  return (
    <SectionPanel title="Progress">
      <UpgradeStepTracker
        phase="colocated_daemon"
        status={daemonStep?.status ?? null}
        errorCode={daemonStep?.errorCode ?? null}
        title="Daemon Step"
      />
      <UpgradeStepTracker
        phase="control_plane"
        status={controlPlaneStep?.status ?? null}
        errorCode={controlPlaneStep?.errorCode ?? null}
        title="Control Plane Step"
      />
      {hasUiTarget ? (
        // The UI package is unpacked and swapped in by the same control-plane
        // step, so its progress is that step's: one step, shown on both rows.
        <UpgradeStepTracker
          phase="control_plane"
          status={controlPlaneStep?.status ?? null}
          errorCode={controlPlaneStep?.errorCode ?? null}
          title="Web Interface Step"
          note="Installed in the same step as the control plane."
        />
      ) : null}
      {runError ? <Text style={panelStyles.error}>{runError}</Text> : null}
      <Text style={panelStyles.pageCopy}>
        {fleetSummary.total > 0
          ? fleetProgressText(fleetSummary, 'servers')
          : 'Server updates: each server’s daemon updates after the control plane is on target.'}
      </Text>
      {waitingOffline ? <InlineNotice tone="info" title={waitingOffline} /> : null}
      <UpgradeFleetTable
        servers={fleetServers}
        total={fleetTotal}
        offset={offset}
        pageSize={UPGRADE_FLEET_PAGE_SIZE}
        onOffsetChange={onOffsetChange}
      />
    </SectionPanel>
  )
}

/**
 * What waits to update on self-hosted, as a sentence: each piece with a newer
 * build (with its version) and daemons behind on other servers. Null while a
 * run is going or nothing waits.
 */
function selfHostedWaiting(
  data: InstanceUpdates,
  consoleBuild: ConsoleBuild | null,
  runGoing: boolean
): string | null {
  const localWaiting = selfHostedUpdateAvailable(data.units, consoleBuild)
  if (runGoing || !isUpdateWaiting(data, localWaiting)) return null
  return waitingSentence({
    pieceLabels: updatePieces(data.units, consoleBuild).map(updatePieceLabel),
    daemonsBehind: data.daemonsBehind === true,
  })
}

export function SelfHostedUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [offset, setOffset] = useState(0)
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: RECENT_UPDATE_RUNS })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, ''))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()

  const shown = runToShow(activeRun.data, {
    version: getInstanceVersion(),
    commit: getInstanceRevision(),
  })
  const run = shown.run
  const failure = runFailure(run)
  const nowMs = useStallClock(run, shown.finished)
  const fleetSteps = useMemo(
    () => (run?.steps ?? []).filter((step) => step.phase === 'fleet'),
    [run?.steps]
  )
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
  const daemonStep = run?.steps.find((step) => step.phase === 'colocated_daemon')
  const controlPlaneStep = run?.steps.find((step) => step.phase === 'control_plane')
  const needsAttention = fleetSummary.needsAttention + (run?.counts?.needsAttention ?? 0)
  const runGoing = Boolean(run && !shown.finished)
  const waiting = selfHostedWaiting(data, consoleBuild, runGoing)

  const headline = resolvePlatformUpgradeHeadline({
    activeRunStatus: shown.finished ? null : (run?.status ?? null),
    updateAvailable: waiting !== null,
    needsAttentionCount: needsAttention,
    paused: data.updatesPaused === true,
  })

  const waitingStep = shown.finished
    ? null
    : (run?.steps.find((step) => stallHint(step, nowMs) !== null) ?? null)
  const stalled = waitingStep ? stallHint(waitingStep, nowMs) : null

  const fleetServers = serversPage.data?.servers.length ? serversPage.data.servers : fleetSteps

  return (
    <View style={styles.root}>
      <UpdatesStatusPanel data={data} headline={headline} waiting={waiting}>
        <View style={styles.row}>
          <Badge tone="muted" label={`Channel ${data.channel}`} />
        </View>
      </UpdatesStatusPanel>

      <ComponentsPanel
        units={data.units}
        consoleBuild={consoleBuild}
        channel={data.channel}
        daemonStep={shown.finished ? null : daemonStep}
        controlPlaneStep={shown.finished ? null : controlPlaneStep}
      />

      {failure ? (
        <UpgradeFailureNotice
          failure={failure}
          lead={shown.finished ? 'Last update failed' : 'Update needs attention'}
        />
      ) : null}
      {stalled ? <InlineNotice title={stalled} /> : null}

      {run && runGoing ? (
        <UpgradeProgressPanel
          run={run}
          hasUiTarget={Boolean(data.units.instance.uiTarget)}
          fleetSummary={fleetSummary}
          fleetServers={fleetServers}
          fleetTotal={serversPage.data?.total ?? fleetServers.length}
          offset={offset}
          onOffsetChange={setOffset}
        />
      ) : null}

      <UpgradeHistoryPanel runs={history.data?.runs ?? []} />

      <UpgradeSettingsCard
        settings={settingsQuery.data?.settings ?? null}
        loading={settingsQuery.isLoading}
        saving={saveSettings.isPending}
        onSave={(next) => {
          saveSettings.mutate(next)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
