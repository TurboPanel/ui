import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { GitSourcesSection } from '@/components/org/git-sources/git-sources-section'
import { spacing } from '@/lib/theme'

export default function ProjectGitSourcesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return (
    <View style={styles.root}>
      <GitSourcesSection scope="org" orgId={orgId ?? ''} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
