import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import {
  RECENT_UPDATE_RUNS,
  UpgradeHistoryPanel,
} from '@/components/admin/updates/upgrade-history-panel'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { UpdatesStatusPanel } from '@/components/admin/updates/updates-status-panel'
import { Badge, InlineNotice, SectionPanel, SegmentedControl } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import { isUpdateWaiting, waitingSentence } from '@/lib/update-automation'
import {
  fleetProgressText,
  offlineWaitingNotice,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
} from '@/lib/upgrade-display'
import {
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import { isUpgradeRunActive } from '@/lib/upgrade-run-poll'
import { spacing } from '@/lib/theme'

/** What waits on TurboPanel High Availability: only daemons; the platform updates the control plane. */
function fleetWaiting(data: InstanceUpdates, runActive: boolean): string | null {
  if (runActive || !isUpdateWaiting(data, false)) return null
  return waitingSentence({ pieceLabels: [], daemonsBehind: true })
}

export function HighAvailabilityUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: RECENT_UPDATE_RUNS })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, statusFilter))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()

  const run = activeRun.data?.run
  const runActive = Boolean(run && isUpgradeRunActive(run.status))
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
  const waitingOffline = offlineWaitingNotice(run?.steps ?? [])
  const waiting = fleetWaiting(data, runActive)
  const headline = resolvePlatformUpgradeHeadline({
    activeRunStatus: runActive ? (run?.status ?? null) : null,
    updateAvailable: waiting !== null,
    needsAttentionCount: fleetSummary.needsAttention,
    paused: data.updatesPaused === true,
  })

  return (
    <View style={styles.root}>
      <InlineNotice
        tone="info"
        title={`${HA_PRODUCT_NAME} manages the control plane`}
        body="Connected daemons update on their own: TurboPanel checks once an hour and updates them in groups. A server that fails is tried again later."
      />

      <UpdatesStatusPanel data={data} headline={headline} waiting={waiting} />

      <SectionPanel title="Control plane">
        <Text style={panelStyles.pageCopy}>Managed by TurboPanel</Text>
        <Badge tone="muted" label={`Installed ${data.units.instance.installed.version}`} />
      </SectionPanel>

      {run ? (
        <SectionPanel title="Server updates">
          <Text style={panelStyles.pageCopy}>
            {fleetSummary.total > 0
              ? fleetProgressText(fleetSummary, 'connected daemons')
              : 'Waiting for servers to start updating.'}
          </Text>
          {waitingOffline ? <InlineNotice tone="info" title={waitingOffline} /> : null}
        </SectionPanel>
      ) : null}

      <SectionPanel title="Connected daemons">
        <SegmentedControl
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            setOffset(0)
          }}
          options={[
            { value: '' as const, label: 'All' },
            { value: 'active' as const, label: 'Updating' },
            { value: 'needs_attention' as const, label: 'Needs attention' },
            { value: 'done' as const, label: 'Up to date' },
          ]}
        />
        <UpgradeFleetTable
          servers={serversPage.data?.servers ?? []}
          total={serversPage.data?.total ?? 0}
          offset={offset}
          pageSize={UPGRADE_FLEET_PAGE_SIZE}
          onOffsetChange={setOffset}
        />
      </SectionPanel>

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
})
