import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ForgeDetailSection } from '@/components/org/git-sources/forge-detail-section'
import { spacing } from '@/lib/theme'

export default function GitAppDetailScreen() {
  const { orgId, appId } = useLocalSearchParams<{ orgId: string; appId: string }>()

  return (
    <View style={styles.root}>
      <ForgeDetailSection orgId={orgId ?? ''} appId={appId ?? ''} scope="org" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
