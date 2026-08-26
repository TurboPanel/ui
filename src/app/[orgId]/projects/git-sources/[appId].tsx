import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { GitAppDetailSection } from '@/components/org/git-sources/git-app-detail-section'
import { spacing } from '@/lib/theme'

export default function GitAppDetailScreen() {
  const { orgId, appId } = useLocalSearchParams<{ orgId: string; appId: string }>()

  return (
    <View style={styles.root}>
      <GitAppDetailSection orgId={orgId ?? ''} appId={appId ?? ''} scope="org" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
