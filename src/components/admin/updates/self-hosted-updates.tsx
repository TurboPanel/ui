import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { UpgradeBuildBlock } from '@/components/admin/updates/upgrade-build-block'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import { UpgradeHistoryPanel } from '@/components/admin/updates/upgrade-history-panel'
import { UpgradePreflightSheet } from '@/components/admin/updates/upgrade-preflight-sheet'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { UpgradeStepTracker } from '@/components/admin/updates/upgrade-step-tracker'
import {
  Badge,
  Button,
  InlineNotice,
  SectionPanel,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates, UpgradePreflightResult } from '@/lib/instance-api'
import { installedIdentity } from '@/lib/instance-updates'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import {
  platformUpgradeHeadlineCopy,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
} from '@/lib/upgrade-display'
import {
  useRetryUpgradeStep,
  useRunUpgradePreflight,
  useSaveUpgradeSettings,
  useStartPlatformUpgrade,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

function installedLabel(version: string | null | undefined, commit: string | null | undefined): string {
  if (version && commit) return `${version} · ${commit.slice(0, 7)}`
  if (version) return version
  if (commit) return commit.slice(0, 7)
  return 'Unknown'
}

function updateAvailable(data: InstanceUpdates): boolean {
  const instanceTarget = data.units.instance.target
  const daemonTarget = data.units.daemon.target
  const instanceBehind =
    instanceTarget &&
    installedIdentity(data.units.instance.installed) !==
      `${instanceTarget.version ?? ''}:${instanceTarget.commit ?? ''}`
  const daemonInstalled = data.units.daemon.installed
  const daemonBehind =
    daemonTarget &&
    daemonInstalled &&
    installedIdentity(daemonInstalled) !==
      `${daemonTarget.version ?? ''}:${daemonTarget.commit ?? ''}`
  return Boolean(instanceBehind || daemonBehind)
}

function upgradeStartNotice(kind: string): string {
  if (kind === 'applied') return 'Upgrade finished.'
  if (kind === 'partially_failed') return 'Upgrade finished with some servers still behind.'
  if (kind === 'failed') return 'Upgrade failed.'
  if (kind === 'cancelled') return 'Upgrade cancelled.'
  if (kind === 'missing') return 'The upgrade run could not be read after it started.'
  return 'Upgrade started. Track progress below.'
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
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null)

  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflight, setPreflight] = useState<UpgradePreflightResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = activeRun.data?.run
  const fleetSteps = useMemo(
    () => (run?.steps ?? []).filter((step) => step.phase === 'fleet'),
    [run?.steps],
  )
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
  const needsAttention = fleetSummary.needsAttention + (run?.counts?.needsAttention ?? 0)

  const headline = resolvePlatformUpgradeHeadline({
    activeRunStatus: run?.status ?? null,
    updateAvailable: updateAvailable(data),
    needsAttentionCount: needsAttention,
  })

  const daemonStep = run?.steps.find((step) => step.phase === 'colocated_daemon')
  const controlPlaneStep = run?.steps.find((step) => step.phase === 'control_plane')

  const fleetServers = serversPage.data?.servers.length
    ? serversPage.data.servers
    : fleetSteps

  const canStart =
    data.managedUpgrade === true &&
    data.units.daemon.connected &&
    (data.units.instance.target !== null || data.units.daemon.target !== null) &&
    headline !== 'updating'

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
    try {
      const outcome = await startUpgrade.mutateAsync(preflight?.runId)
      setPreflightOpen(false)
      setNotice(upgradeStartNotice(outcome.kind))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upgrade failed to start')
    }
  }

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
            busy={startUpgrade.isPending || preflightMutation.isPending}
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
            data.units.instance.installed.commit,
          )}
        />
        <UpgradeBuildBlock
          title="Co-located daemon"
          target={data.units.daemon.target}
          installedLabel={
            data.units.daemon.installed
              ? installedLabel(
                  data.units.daemon.installed.version,
                  data.units.daemon.installed.commit,
                )
              : 'Not connected'
          }
        />
      </SectionPanel>

      {run || updateAvailable(data) ? (
        <SectionPanel title="Progress">
          <UpgradeStepTracker
            phase="colocated_daemon"
            status={daemonStep?.status ?? null}
            title="Co-located daemon"
          />
          <UpgradeStepTracker
            phase="control_plane"
            status={controlPlaneStep?.status ?? null}
            title="Control plane"
          />
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
        busy={startUpgrade.isPending}
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
