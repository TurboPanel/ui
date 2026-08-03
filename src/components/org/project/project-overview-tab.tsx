import { StyleSheet, View } from 'react-native'
import { ComposeServicesTab } from '@/components/org/project/compose-tabs'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

/**
 * Compose/Template overview: Compose panel hosts the project server
 * picker, Project / environment switcher, lifecycle actions, and the compose
 * editor or per-service status list. Managed projects use
 * {@link ManagedFocusTab} instead.
 */
export function ProjectOverviewTab() {
  const { project } = useProjectContext()
  if (!project || isManagedProject(project)) return null

  return (
    <View style={styles.root}>
      <ComposeServicesTab />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
})
