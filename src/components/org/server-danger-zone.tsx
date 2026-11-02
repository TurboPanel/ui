import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/ui/section-panel'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

/**
 * Last section of the server page. An offline server leads with the removal
 * card, because "Delete server" cannot reach the host; an online server keeps
 * the daemon key cutoff first, then delete.
 */
export function ServerDangerZone({
  offline,
  revokeKeyPanel,
  deletePanel,
  reenrollPanel = null,
}: Readonly<{
  offline: boolean
  revokeKeyPanel: ReactNode
  deletePanel: ReactNode
  /** Owner-only Re-Enroll Token and minted keys; renders its own panels. */
  reenrollPanel?: ReactNode
}>) {
  const remove = (
    <SectionPanel
      key="remove"
      title={offline ? 'Remove this server' : 'Delete server'}
      hint={offline ? 'The host is gone' : 'Two-step confirm'}
    >
      {deletePanel}
    </SectionPanel>
  )
  const revoke = (
    <SectionPanel key="revoke" title="Revoke daemon key" hint="Compromised-host cutoff">
      {revokeKeyPanel}
    </SectionPanel>
  )
  return (
    <View style={styles.root} accessibilityLabel="Danger zone">
      <Text style={panelStyles.detailTitle} accessibilityRole="header">
        Danger zone
      </Text>
      {reenrollPanel}
      {offline ? [remove, revoke] : [revoke, remove]}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.sm },
})
