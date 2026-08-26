import { StyleSheet, View } from 'react-native'
import { GitAppsSection } from '@/components/admin/git-apps-section'
import { spacing } from '@/lib/theme'

export default function OrgGitAppsScreen() {
  return (
    <View style={styles.root}>
      <GitAppsSection scope="org" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
