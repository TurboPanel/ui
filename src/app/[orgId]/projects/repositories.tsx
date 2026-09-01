import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { RepositoriesSection } from '@/components/org/repositories-section'
import { spacing } from '@/lib/theme'

export default function ProjectRepositoriesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return (
    <View style={styles.root}>
      <RepositoriesSection orgId={orgId ?? ''} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
