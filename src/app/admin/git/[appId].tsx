import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ForgeDetailSection } from '@/components/org/git-sources/forge-detail-section'
import { spacing } from '@/lib/theme'

/**
 * The instance-wide half of the app detail screen.
 *
 * There is no `orgId` here, and that is not a gap to paper over: a repository
 * *installation* belongs to an organization, so an instance admin looking at a
 * shared app sees what the app is and where its deliveries arrive, not a list
 * of accounts that would belong to someone else's organization.
 */
export default function AdminGitAppDetailScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>()

  return (
    <View style={styles.root}>
      <ForgeDetailSection orgId="" appId={appId ?? ''} scope="admin" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
