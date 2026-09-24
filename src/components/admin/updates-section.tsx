import { StyleSheet, Text, View } from 'react-native'
import { HighAvailabilityUpdates } from '@/components/admin/updates/ha-updates'
import { SelfHostedUpdates } from '@/components/admin/updates/self-hosted-updates'
import { InlineNotice, LoadingState } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { useInstanceUpdates } from '@/lib/queries/admin'
import { spacing } from '@/lib/theme'

export function UpdatesSection() {
  const query = useInstanceUpdates()
  const statusQuery = useInstallStatusQuery()
  const runtime = statusQuery.data?.runtime

  if (query.isLoading) return <LoadingState label="Loading updates" />

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Failed to load updates'
    return <InlineNotice tone="warning" title={message} />
  }

  const data = query.data
  if (!data) return null

  const managed =
    data.updatesManaged === true || data.runtime === 'workers' || runtime === 'workers'

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Updates</Text>
      <Text style={panelStyles.pageCopy}>
        {managed
          ? 'Fleet rollout status for TurboPanel High Availability. The hosted control plane updates on its own release cadence.'
          : 'Upgrade the co-located daemon, control plane, and connected fleet from one managed run.'}
      </Text>
      {managed ? <HighAvailabilityUpdates data={data} /> : <SelfHostedUpdates data={data} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
})
