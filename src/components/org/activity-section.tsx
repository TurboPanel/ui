import { StyleSheet, Text, View } from 'react-native'
import { NotificationsPanelBody } from '@/components/notifications-panel-body'
import { SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

/**
 * The Activity page. Until the organization-wide deploy feed (the activity
 * page PR) takes this file over, it shows the one activity list the app
 * already has: the notifications inbox from the header bell. The inbox is per
 * person, so the page takes no organization yet; the feed will.
 */
export function ActivitySection() {
  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Activity</Text>
      <SectionPanel title="Recent activity" hint="What needs your attention">
        <NotificationsPanelBody />
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
})
