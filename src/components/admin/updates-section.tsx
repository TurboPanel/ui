import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { HighAvailabilityUpdates } from '@/components/admin/updates/ha-updates'
import { SelfHostedUpdates } from '@/components/admin/updates/self-hosted-updates'
import { Button, InlineNotice, LoadingState } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  RECONNECT_RETRY_LABEL,
  RECONNECT_SLOW_COPY,
  RECONNECTING_TITLE,
  isControlPlaneUnreachable,
  reconnectBody,
} from '@/lib/control-plane-reconnect'
import { useControlPlaneReconnect } from '@/lib/use-control-plane-reconnect'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { useInstanceUpdates } from '@/lib/queries/admin'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

export function UpdatesSection() {
  const consoleCommit = useMemo(() => readConsoleBuild()?.commit, [])
  const query = useInstanceUpdates({ consoleCommit })
  const statusQuery = useInstallStatusQuery()
  const runtime = statusQuery.data?.runtime

  const unreachable = query.isError && isControlPlaneUnreachable(query.error)
  const { refetch } = query
  const retryUpdates = useCallback(() => {
    void refetch()
  }, [refetch])
  const reconnect = useControlPlaneReconnect(unreachable, retryUpdates)

  if (query.isLoading) return <LoadingState label="Loading updates" />

  if (query.isError && reconnect.view) {
    const slow = reconnect.view.phase === 'slow'
    const body = reconnectBody(reconnect.view)
    return (
      <InlineNotice
        tone="warning"
        title={RECONNECTING_TITLE}
        body={slow ? `${body} ${RECONNECT_SLOW_COPY}` : body}
        actions={
          slow ? (
            <Button label={RECONNECT_RETRY_LABEL} variant="primary" onPress={reconnect.retryNow} />
          ) : undefined
        }
      />
    )
  }

  if (query.isError) {
    const message = userErrorMessage(query.error, 'Failed to load updates')
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
          ? 'Server update status for your servers on TurboPanel High Availability. TurboPanel updates the control plane itself on its own release cadence.'
          : 'Update the control plane, web app and daemon here, then each connected server’s daemon.'}
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
