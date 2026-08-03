import { StyleSheet, View } from 'react-native'
import { ComposeServicesTab } from '@/components/org/project/compose-tabs'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

/**
 * Compose/Template overview: compact environment toggle (Base / env name) with
 * refined Start / Stop / Refresh / Destroy, then Base Compose editor until the
 * environment has been started (containers exist), then a collapsed per-service
 * status list. Managed projects use {@link ManagedFocusTab} instead.
 */
export function ProjectOverviewTab() {
  const { project } = useProjectContext()
  if (!project || isManagedProject(project)) return null

  return (
    <View style={styles.root}>
      <OverviewEnvironmentsPanel />
      <ComposeServicesTab />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
})
