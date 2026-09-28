import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { UpgradeBuildBlock } from '@/components/admin/updates/upgrade-build-block'
import { UpgradeFailureNotice } from '@/components/admin/updates/upgrade-failure-notice'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import { UpgradeHistoryPanel } from '@/components/admin/updates/upgrade-history-panel'
import { UpgradePreflightSheet } from '@/components/admin/updates/upgrade-preflight-sheet'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { UpgradeStepTracker } from '@/components/admin/updates/upgrade-step-tracker'
import { Badge, Button, ConfirmButton, InlineNotice, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates, UpgradePreflightResult } from '@/lib/instance-api'
import { platformUpdateAvailable } from '@/lib/instance-updates'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import {
  platformUpgradeHeadlineCopy,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
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

function installedLabel(
  version: string | null | undefined,
  commit: string | null | undefined
): string {
  if (version && commit) return `${version} · ${commit.slice(0, 7)}`
  if (version) return version
  if (commit) return commit.slice(0, 7)
  return 'Unknown'
}

export function SelfHostedUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [offset, setOffset] = useState(0)
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: 8 })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, ''))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()
  const preflightMutation = useRunUpgradePreflight()
  const startUpgrade = useStartPlatformUpgrade()
  const retryStep = useRetryUpgradeStep()
  const cancelRun = useCancelUpgradeRun()
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null)

  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<UpgradePreflightResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const shown = runToShow(activeRun.data)
  const run = shown.run
  const failure = runFailure(run)
  const [starting, setStarting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const router = useRouter()
  const params = useLocalSearchParams<{ update?: string }>()
  const autoOpened = useRef(false)
  const fleetSteps = useMemo(
    () => (run?.steps ?? []).filter((step) => step.phase === 'fleet'),
    [run?.steps]
  )
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
  const needsAttention = fleetSummary.needsAttention + (run?.counts?.needsAttention ?? 0)

  const headline = resolvePlatformUpgradeHeadline({
    activeRunStatus: shown.finished ? null : (run?.status ?? null),
    updateAvailable: platformUpdateAvailable(data.units),
    needsAttentionCount: needsAttention,
  })

  const daemonStep = run?.steps.find((step) => step.phase === 'colocated_daemon')
  const controlPlaneStep = run?.steps.find((step) => step.phase === 'control_plane')
  const waitingStep = shown.finished
    ? null
    : (run?.steps.find((step) => stallHint(step, nowMs) !== null) ?? null)
  const stalled = waitingStep ? stallHint(waitingStep, nowMs) : null

  // Re-read the clock while a run is active so the "still waiting" hint appears
  // without a new poll result.
  useEffect(() => {
    if (!run || shown.finished) return undefined
    const timer = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [run, shown.finished])

  const fleetServers = serversPage.data?.servers.length ? serversPage.data.servers : fleetSteps

  const canStart =
    data.managedUpgrade === true &&
    data.units.daemon.connected &&
    platformUpdateAvailable(data.units) &&
    headline !== 'updating' &&
    !starting

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
        void activeRun.refetch()
      } else {
        setNotice(err instanceof Error ? err.message : 'Upgrade failed to start')
      }
    } finally {
      setStarting(false)
    }
  }

  // The update banner links here with ?update=1: open the confirmation once.
  useEffect(() => {
    if (params.update !== '1' || autoOpened.current || !canStart) return
    autoOpened.current = true
    router.setParams({ update: undefined })
    void openPreflight()
  })

  return (
    <View style={styles.root}>
      {notice ? <InlineNotice tone="info" title={notice} /> : null}

      <SectionPanel title="Status">
        <Text style={styles.headline}>{platformUpgradeHeadlineCopy(headline)}</Text>
        <View style={styles.row}>
          <Badge tone="muted" label={`Channel ${data.channel}`} />
          <Button
            label="Update TurboPanel"
            variant="primary"
            busy={starting || preflightMutation.isPending}
            disabled={!canStart}
            onPress={() => {
              void openPreflight()
            }}
          />
        </View>
      </SectionPanel>

      <SectionPanel title="Target build">
        <UpgradeBuildBlock
          title="Control plane"
          target={data.units.instance.target}
          installedLabel={installedLabel(
            data.units.instance.installed.version,
            data.units.instance.installed.commit
          )}
        />
        <UpgradeBuildBlock
          title="Co-located daemon"
          target={data.units.daemon.target}
          installedLabel={
            data.units.daemon.installed
              ? installedLabel(
                  data.units.daemon.installed.version,
                  data.units.daemon.installed.commit
                )
              : 'Not connected'
          }
        />
      </SectionPanel>

      {failure ? (
        <UpgradeFailureNotice
          failure={failure}
          lead={shown.finished ? 'Last update failed' : 'Update needs attention'}
        />
      ) : null}
      {stalled ? <InlineNotice title={stalled} /> : null}

      {run || platformUpdateAvailable(data.units) ? (
        <SectionPanel
          title="Progress"
          headerRight={
            run && !shown.finished ? (
              <ConfirmButton
                label="Cancel run"
                confirmLabel="Cancel run"
                prompt="Stop this run? Steps already applied stay applied; anything still pending is skipped. Start a fresh update afterward to pick up the current target build."
                busy={cancelRun.isPending}
                onConfirm={() => {
                  setNotice(null)
                  cancelRun.mutate(run.id, {
                    onSuccess: () => {
                      setNotice('Run cancelled. Start a fresh update to try again.')
                    },
                    onError: (err) => {
                      setNotice(err instanceof Error ? err.message : 'Failed to cancel the run')
                    },
                  })
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
          {upgradeRunErrorLabel(run?.error) ? (
            <Text style={panelStyles.error}>{upgradeRunErrorLabel(run?.error)}</Text>
          ) : null}
          <Text style={panelStyles.pageCopy}>
            {fleetSummary.total > 0
              ? `${fleetSummary.upToDate} of ${fleetSummary.total} fleet servers up to date`
              : 'Fleet wave starts after the control plane is on target.'}
          </Text>
          <UpgradeFleetTable
            servers={fleetServers}
            total={serversPage.data?.total ?? fleetServers.length}
            offset={offset}
            pageSize={UPGRADE_FLEET_PAGE_SIZE}
            onOffsetChange={setOffset}
            retryingId={retryingStepId}
            onRetry={(stepId) => {
              setRetryingStepId(stepId)
              retryStep.mutate(stepId, {
                onSettled: () => {
                  setRetryingStepId(null)
                },
              })
            }}
          />
        </SectionPanel>
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
        visible={preflightOpen}
        preflight={preflight}
        busy={starting}
        onClose={() => {
          setPreflightOpen(false)
        }}
        onConfirm={() => {
          void confirmUpgrade()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
