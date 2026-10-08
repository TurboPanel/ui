import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { UpgradeFleetTable } from '@/components/admin/updates/upgrade-fleet-table'
import { UpgradeHistoryPanel } from '@/components/admin/updates/upgrade-history-panel'
import { UpgradePreflightSheet } from '@/components/admin/updates/upgrade-preflight-sheet'
import { UpgradeSettingsCard } from '@/components/admin/updates/upgrade-settings-card'
import { useStartUpgradeFlow } from '@/components/admin/updates/use-start-upgrade-flow'
import {
  Badge,
  Button,
  ConfirmButton,
  InlineNotice,
  SectionPanel,
  SegmentedControl,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import { summarizeFleetSteps } from '@/lib/upgrade-display'
import {
  useCancelUpgradeRun,
  useRetryUpgradeStep,
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from '@/lib/queries/admin'
import { fleetServersQuery, UPGRADE_FLEET_PAGE_SIZE } from '@/lib/upgrade-batch'
import { isUpgradeRunActive } from '@/lib/upgrade-run-poll'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

export function HighAvailabilityUpdates({ data }: Readonly<{ data: InstanceUpdates }>) {
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const activeRun = useUpgradeActiveRun()
  const history = useUpgradeHistory({ offset: 0, limit: 8 })
  const serversPage = useUpgradeServersPage(fleetServersQuery(offset, statusFilter))
  const settingsQuery = useUpgradeSettings()
  const saveSettings = useSaveUpgradeSettings()
  const retryStep = useRetryUpgradeStep()
  const cancelRun = useCancelUpgradeRun()
  const flow = useStartUpgradeFlow(() => activeRun.refetch())
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = activeRun.data?.run
  const runActive = Boolean(run && isUpgradeRunActive(run.status))
  const fleetSummary = summarizeFleetSteps(run?.steps ?? [])
  const displayNotice = flow.notice ?? notice

  return (
    <View style={styles.root}>
      <InlineNotice
        tone="info"
        title={`${HA_PRODUCT_NAME} manages the control plane`}
        body="Connected daemons follow the update below. Per-server Update actions stay off while updates are platform-managed. Use Update fleet now to roll out the newest build to every connected daemon."
      />
      {displayNotice ? <InlineNotice tone="info" title={displayNotice} /> : null}

      <SectionPanel title="Control plane">
        <Text style={panelStyles.pageCopy}>Managed by TurboPanel</Text>
        <Badge tone="muted" label={`Installed ${data.units.instance.installed.version}`} />
      </SectionPanel>

      {run ? (
        <SectionPanel
          title="Server updates"
          headerRight={
            // A run keeps the target it was created with. Cancelling a stale one
            // lets Update fleet now, or the next automatic check, start fresh.
            <ConfirmButton
              label="Cancel update"
              confirmLabel="Cancel update"
              prompt="Stop this update? Daemons already updated stay updated; anything still pending is skipped. The next update starts against the current build."
              busy={cancelRun.isPending}
              onConfirm={() => {
                setNotice(null)
                flow.setNotice(null)
                cancelRun.mutate(run.id, {
                  onSuccess: () => {
                    setNotice(
                      'Update cancelled. Use Update fleet now, or turn on automatic updates and a fresh one starts on the next check.'
                    )
                  },
                  onError: (err) => {
                    setNotice(userErrorMessage(err, 'Failed to cancel the update'))
                  },
                })
              }}
            />
          }
        >
          <Text style={panelStyles.pageCopy}>
            {fleetSummary.total > 0
              ? `${fleetSummary.upToDate} of ${fleetSummary.total} connected daemons up to date`
              : 'Waiting for servers to start updating.'}
          </Text>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="Connected daemons"
        headerRight={
          <Button
            label="Update fleet now"
            variant="primary"
            busy={flow.starting || flow.preflightPending}
            disabled={runActive || flow.starting}
            onPress={() => {
              setNotice(null)
              void flow.openPreflight()
            }}
          />
        }
      >
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

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
})
