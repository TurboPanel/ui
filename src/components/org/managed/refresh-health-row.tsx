import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { managedHealthRefreshNotice } from '@/lib/managed-services'
import { useRefreshManagedStatus } from '@/lib/queries/managed'
import { spacing } from '@/lib/theme'

/**
 * "Refresh health": asks each replica's daemon for a fresh reading so the
 * promote gate (which rejects an observation older than two minutes) can pass
 * on a healthy idle cluster. An explicit action only; the background poll
 * never does this. Renders nothing for a cluster with no replica.
 */
export function RefreshHealthRow({
  orgId,
  environmentId,
  hasReplicas,
  disabled,
  onError,
}: Readonly<{
  orgId: string
  environmentId: string
  hasReplicas: boolean
  disabled: boolean
  onError: (message: string | null) => void
}>) {
  const refreshStatus = useRefreshManagedStatus(orgId, environmentId)
  const [notice, setNotice] = useState<string | null>(null)

  if (!hasReplicas) return null

  const refresh = async () => {
    onError(null)
    setNotice(null)
    const outcome = await refreshStatus.run()
    if (!outcome.ok) {
      if (outcome.error) onError(outcome.error)
      return
    }
    setNotice(managedHealthRefreshNotice(outcome.value.healthRefresh))
  }

  return (
    <View style={styles.row}>
      <Button
        label="Refresh health"
        busyLabel="Refreshing…"
        busy={refreshStatus.isPending}
        disabled={disabled}
        onPress={() => {
          void refresh()
        }}
      />
      {notice ? <Text style={panelStyles.detailLine}>{notice}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
})
