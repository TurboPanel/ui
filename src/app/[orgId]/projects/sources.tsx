import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SourcesOverviewSection } from '@/components/org/sources/sources-overview-section'
import { spacing } from '@/lib/theme'

export default function ProjectSourcesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return (
    <View style={styles.root}>
      <SourcesOverviewSection orgId={orgId ?? ''} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
