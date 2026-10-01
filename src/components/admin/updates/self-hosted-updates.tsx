import { useLocalSearchParams, useRouter } from 'expo-router'
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
      setNotice(err instanceof Error ? err.message : 'Preflight failed')
    }
  }

  const confirmUpgrade = async () => {
    setStarting(true)
    try {
      const outcome = await withStartTimeout(startUpgrade.mutateAsync(preflight?.runId))
      setPreflightOpen(false)
      setNotice(
        `Upgrade started (run ${outcome.runId.slice(0, 8)}). Progress shows below as each step reports.`
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
      } else if (err instanceof Error && err.message.includes('upgrade_run_active')) {
        setPreflightOpen(false)
        setNotice('Another update is already in progress. Wait for it to finish, or cancel it.')
        void refetchActiveRun()
      } else {
        setNotice(err instanceof Error ? err.message : 'Upgrade failed to start')
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
        setNotice('Run cancelled. Start a fresh update to try again.')
      },
      onError: (err) => {
        setNotice(err instanceof Error ? err.message : 'Failed to cancel the run')
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
}: Readonly<{
  units: InstanceUpdates['units']
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
      />
      <UpgradeBuildBlock
        title="Web app"
        target={instance.uiTarget}
        installedLabel={installedBuildLabel(consoleBuild, instance.uiTarget, hideCommit)}
        updateAvailable={consoleUpdateAvailable(consoleBuild, instance.uiTarget)}
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
            label="Cancel run"
            confirmLabel="Cancel run"
            prompt="Stop this run? Steps already applied stay applied; anything still pending is skipped. Start a fresh update afterward to pick up the current target build."
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
        title="Co-located daemon"
      />
      <UpgradeStepTracker
        phase="control_plane"
        status={controlPlaneStep?.status ?? null}
        errorCode={controlPlaneStep?.errorCode ?? null}
        title="Control plane"
      />
      {hasUiTarget ? (
        // The UI package is unpacked and swapped in by the same control-plane
        // step, so its progress is that step's: one step, shown on both rows.
        <UpgradeStepTracker
          phase="control_plane"
          status={controlPlaneStep?.status ?? null}
          errorCode={controlPlaneStep?.errorCode ?? null}
          title="Web app"
          note="Installed together with the control plane."
        />
      ) : null}
      {runError ? <Text style={panelStyles.error}>{runError}</Text> : null}
      <Text style={panelStyles.pageCopy}>
        {fleetSummary.total > 0
          ? `${fleetSummary.upToDate} of ${fleetSummary.total} servers up to date`
          : 'Servers update after the control plane is on target.'}
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

  const shown = runToShow(activeRun.data)
  const run = shown.run
  const failure = runFailure(run)
  const nowMs = useStallClock(run, shown.finished)
  const fleetSteps = useMemo(
    () => (run?.steps ?? []).filter((step) => step.phase === 'fleet'),
    [run?.steps]
  )
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
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

      <ComponentsPanel units={data.units} consoleBuild={consoleBuild} channel={data.channel} />

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
