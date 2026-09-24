import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import { UpgradeHistoryPanel } from '@/components/admin/updates/upgrade-history-panel'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { Badge, InlineNotice, SectionPanel, SegmentedControl } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import { summarizeFleetSteps } from '@/lib/upgrade-display'
import {
  useRetryUpgradeStep,
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import { spacing } from '@/lib/theme'

export function HighAvailabilityUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: 8 })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, statusFilter))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()
  const retryStep = useRetryUpgradeStep()
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null)

  const run = activeRun.data?.run
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])

  return (
    <View style={styles.root}>
      <InlineNotice
        tone="info"
        title={`${HA_PRODUCT_NAME} manages the control plane`}
        body="Connected daemons follow the rollout below. Per-server Update actions stay off while updates are platform-managed."
      />

      <SectionPanel title="Control plane">
        <Text style={panelStyles.pageCopy}>Managed by TurboPanel</Text>
        <Badge tone="muted" label={`Installed ${data.units.instance.installed.version}`} />
      </SectionPanel>

      {run ? (
        <SectionPanel title="Rollout">
          <Text style={panelStyles.pageCopy}>
            {fleetSummary.total > 0
              ? `${fleetSummary.upToDate} of ${fleetSummary.total} connected daemons up to date`
              : 'Waiting for the fleet wave to start.'}
          </Text>
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

      <UpgradeHistoryPanel runs={history.data?.runs ?? []} />

      <UpgradeSettingsCard
        settings={settingsQuery.data?.settings ?? null}
        loading={settingsQuery.isLoading}
        saving={saveSettings.isPending}
        hideAutoUpdate
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
