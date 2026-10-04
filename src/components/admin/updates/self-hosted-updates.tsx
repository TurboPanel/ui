import { useLocalSearchParams, useRouter } from 'expo-router'
import { getInstanceRevision, getInstanceVersion } from '@/lib/instance-version'
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { UpgradeBuildBlock } from '@/components/admin/updates/upgrade-build-block'
import { UpgradeFailureNotice } from '@/components/admin/updates/upgrade-failure-notice'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import { UpgradeHistoryPanel } from '@/components/admin/updates/upgrade-history-panel'
import { UpgradePreflightSheet } from '@/components/admin/updates/upgrade-preflight-sheet'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { UpgradeStepTracker } from '@/components/admin/updates/upgrade-step-tracker'
import {
  Badge,
  Button,
  ConfirmButton,
  InlineNotice,
  SectionPanel,
  StatusDot,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates, UpgradePreflightResult } from '@/lib/instance-api'
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
  installedBuildLabel,
  platformUpgradeHeadlineCopy,
  type PieceStepView,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
  updateAvailableSentence,
  upgradeRunErrorLabel,
} from '@/lib/upgrade-display'
import {
  useCancelUpgradeRun,
  useRetryUpgradeStep,
  useRunUpgradePreflight,
  useSaveUpgradeSettings,
  useStartPlatformUpgrade,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import {
  runFailure,
  runToShow,
  stallHint,
  UpgradeStartTimeoutError,
  withStartTimeout,
} from '@/lib/update-status'
import { colors, spacing } from '@/lib/theme'
import { UPDATE_ALREADY_ACTIVE_COPY, apiErrorCopy, userErrorMessage } from '@/lib/user-error'

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

/** The preflight sheet, starting an update, and the notice line they report through. */
function useStartUpgradeFlow(refetchActiveRun: () => unknown, consoleCommit?: string) {
  const preflightMutation = useRunUpgradePreflight()
  const startUpgrade = useStartPlatformUpgrade(consoleCommit)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<UpgradePreflightResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const openPreflight = async () => {
    setNotice(null)
    try {
      const result = await preflightMutation.mutateAsync()
      setPreflight(result)
      setPreflightOpen(true)
    } catch (err) {
      setNotice(userErrorMessage(err, 'Preflight failed'))
    }
  }

  const confirmUpgrade = async () => {
    setStarting(true)
    try {
      const outcome = await withStartTimeout(startUpgrade.mutateAsync(preflight?.runId))
      setPreflightOpen(false)
      setNotice(
        `Update started (${outcome.runId.slice(0, 8)}). Progress shows below as each step reports.`
      )
    } catch (err) {
      if (err instanceof UpgradeStartTimeoutError) {
        // Never spin forever: close the sheet and let the status below say
        // whether a run started.
        setPreflightOpen(false)
        setNotice(
          'Still waiting for the control plane to confirm the update started. The progress below refreshes on its own; if nothing appears, check the daemon log on the server.'
        )
        void refetchActiveRun()
      } else if (apiErrorCopy(err) === UPDATE_ALREADY_ACTIVE_COPY) {
        setPreflightOpen(false)
        setNotice(UPDATE_ALREADY_ACTIVE_COPY)
        void refetchActiveRun()
      } else {
        setNotice(userErrorMessage(err, 'Update failed to start'))
      }
    } finally {
      setStarting(false)
    }
  }

  return {
    preflightPending: preflightMutation.isPending,
    preflightOpen,
    setPreflightOpen,
    preflight,
    notice,
    setNotice,
    starting,
    openPreflight,
    confirmUpgrade,
  }
}

/** The update banner links here with ?update=1: open the confirmation once. */
function useAutoOpenPreflight(canStart: boolean, openPreflight: () => Promise<void>) {
  const router = useRouter()
  const params = useLocalSearchParams<{ update?: string }>()
  const autoOpened = useRef(false)
  useEffect(() => {
    if (params.update !== '1' || autoOpened.current || !canStart) return
    autoOpened.current = true
    router.setParams({ update: undefined })
    void openPreflight()
  })
}

function useCancelRun(setNotice: (notice: string | null) => void) {
  const cancelRun = useCancelUpgradeRun()
  const cancel = (runId: string) => {
    setNotice(null)
    cancelRun.mutate(runId, {
      onSuccess: () => {
        setNotice('Update cancelled. Start a fresh update to try again.')
      },
      onError: (err) => {
        setNotice(userErrorMessage(err, 'Failed to cancel the update'))
      },
    })
  }
  return { cancel, cancelling: cancelRun.isPending }
}

function useRetryFleetStep() {
  const retryStep = useRetryUpgradeStep()
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null)
  const retry = (stepId: string) => {
    setRetryingStepId(stepId)
    retryStep.mutate(stepId, {
      onSettled: () => {
        setRetryingStepId(null)
      },
    })
  }
  return { retryingStepId, retry }
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
        title="Control plane"
        target={instance.target}
        installedLabel={installedBuildLabel(instance.installed, instance.target, hideCommit)}
        updateAvailable={unitUpdateAvailable(instance)}
        running={instance.installed}
        step={controlPlaneStep}
      />
      <UpgradeBuildBlock
        title="Web app"
        target={instance.uiTarget}
        installedLabel={installedBuildLabel(consoleBuild, instance.uiTarget, hideCommit)}
        updateAvailable={consoleUpdateAvailable(consoleBuild, instance.uiTarget)}
        running={consoleBuild}
        step={controlPlaneStep}
      />
      <UpgradeBuildBlock
        title="Co-located daemon"
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
  finished,
  hasUiTarget,
  fleetSummary,
  fleetServers,
  fleetTotal,
  offset,
  onOffsetChange,
  retryingId,
  onRetry,
  cancelling,
  onCancel,
}: Readonly<{
  run: ShownRun | null
  finished: boolean
  hasUiTarget: boolean
  fleetSummary: ReturnType<typeof summarizeFleetSteps>
  fleetServers: FleetServers
  fleetTotal: number
  offset: number
  onOffsetChange: (offset: number) => void
  retryingId: string | null
  onRetry: (stepId: string) => void
  cancelling: boolean
  onCancel: (runId: string) => void
}>) {
  const daemonStep = run?.steps.find((step) => step.phase === 'colocated_daemon')
  const controlPlaneStep = run?.steps.find((step) => step.phase === 'control_plane')
  const runError = upgradeRunErrorLabel(run?.error)

  return (
    <SectionPanel
      title="Progress"
      headerRight={
        run && !finished ? (
          <ConfirmButton
            label="Cancel update"
            confirmLabel="Cancel update"
            prompt="Stop this update? Steps already applied stay applied; anything still pending is skipped. Start a fresh update afterward to pick up the current target build."
            busy={cancelling}
            onConfirm={() => {
              onCancel(run.id)
            }}
          />
        ) : null
      }
    >
      <UpgradeStepTracker
        phase="colocated_daemon"
        status={daemonStep?.status ?? null}
        errorCode={daemonStep?.errorCode ?? null}
        title="Daemon step"
      />
      <UpgradeStepTracker
        phase="control_plane"
        status={controlPlaneStep?.status ?? null}
        errorCode={controlPlaneStep?.errorCode ?? null}
        title="Control plane step"
      />
      {hasUiTarget ? (
        // The UI package is unpacked and swapped in by the same control-plane
        // step, so its progress is that step's: one step, shown on both rows.
        <UpgradeStepTracker
          phase="control_plane"
          status={controlPlaneStep?.status ?? null}
          errorCode={controlPlaneStep?.errorCode ?? null}
          title="Web app step"
          note="Installed together with the control plane."
        />
      ) : null}
      {runError ? <Text style={panelStyles.error}>{runError}</Text> : null}
      <Text style={panelStyles.pageCopy}>
        {fleetSummary.total > 0
          ? `${fleetSummary.upToDate} of ${fleetSummary.total} servers up to date`
          : 'Server updates: each server’s daemon updates after the control plane is on target.'}
      </Text>
      <UpgradeFleetTable
        servers={fleetServers}
        total={fleetTotal}
        offset={offset}
        pageSize={UPGRADE_FLEET_PAGE_SIZE}
        onOffsetChange={onOffsetChange}
        retryingId={retryingId}
        onRetry={onRetry}
      />
    </SectionPanel>
  )
}

export function SelfHostedUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [offset, setOffset] = useState(0)
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: 8 })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, ''))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()
  const flow = useStartUpgradeFlow(() => activeRun.refetch(), consoleBuild?.commit)
  const { cancel, cancelling } = useCancelRun(flow.setNotice)
  const { retryingStepId, retry } = useRetryFleetStep()

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

  const headline = resolvePlatformUpgradeHeadline({
    activeRunStatus: shown.finished ? null : (run?.status ?? null),
    updateAvailable: selfHostedUpdateAvailable(data.units, consoleBuild),
    needsAttentionCount: needsAttention,
  })

  const waitingStep = shown.finished
    ? null
    : (run?.steps.find((step) => stallHint(step, nowMs) !== null) ?? null)
  const stalled = waitingStep ? stallHint(waitingStep, nowMs) : null

  const fleetServers = serversPage.data?.servers.length ? serversPage.data.servers : fleetSteps

  const canStart =
    data.managedUpgrade === true &&
    data.units.daemon.connected &&
    selfHostedUpdateAvailable(data.units, consoleBuild) &&
    headline !== 'updating' &&
    !flow.starting

  useAutoOpenPreflight(canStart, flow.openPreflight)

  return (
    <View style={styles.root}>
      {flow.notice ? <InlineNotice tone="info" title={flow.notice} /> : null}

      <SectionPanel title="Status">
        <View style={styles.statusRow}>
          <View style={styles.statusText}>
            <View style={styles.headlineRow}>
              <StatusDot tone={headlineTone(headline)} />
              <Text style={styles.headline}>{platformUpgradeHeadlineCopy(headline)}</Text>
            </View>
            {headline === 'update_available' ? (
              <Text style={panelStyles.muted}>
                {updateAvailableSentence(
                  updatePieces(data.units, consoleBuild).map(updatePieceLabel)
                ) ?? ''}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Badge tone="muted" label={`Channel ${data.channel}`} />
            </View>
          </View>
          <Button
            label="Update TurboPanel"
            variant="primary"
            busy={flow.starting || flow.preflightPending}
            disabled={!canStart}
            onPress={() => {
              void flow.openPreflight()
            }}
          />
        </View>
      </SectionPanel>

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

      {run && !shown.finished ? (
        <UpgradeProgressPanel
          run={run}
          finished={shown.finished}
          hasUiTarget={Boolean(data.units.instance.uiTarget)}
          fleetSummary={fleetSummary}
          fleetServers={fleetServers}
          fleetTotal={serversPage.data?.total ?? fleetServers.length}
          offset={offset}
          onOffsetChange={setOffset}
          retryingId={retryingStepId}
          onRetry={retry}
          cancelling={cancelling}
          onCancel={cancel}
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

      <UpgradePreflightSheet
        visible={flow.preflightOpen}
        preflight={flow.preflight}
        busy={flow.starting}
        onClose={() => {
          flow.setPreflightOpen(false)
        }}
        onConfirm={() => {
          void flow.confirmUpgrade()
        }}
      />
    </View>
  )
}

function headlineTone(headline: ReturnType<typeof resolvePlatformUpgradeHeadline>) {
  switch (headline) {
    case 'up_to_date':
      return 'online' as const
    case 'needs_attention':
      return 'failed' as const
    default:
      return 'pending' as const
  }
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusText: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
