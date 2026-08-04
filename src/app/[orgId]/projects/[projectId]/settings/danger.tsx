import { Redirect, useRouter, type Href } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectTabHref } from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

/** Settings sub-pages removed — redirect deep links to Overview (system: notice). */
export default function SettingsSubScreenRedirect() {
  const router = useRouter()
  const { orgId, projectId, isSystemProject, projectAllowsMutations } = useProjectContext()

  if (isSystemProject || !projectAllowsMutations) {
    return (
      <View style={styles.root}>
        <SectionPanel title="Settings">
          <SystemManagedNotice
            onBack={() =>
              router.replace(projectTabHref(orgId, projectId, 'overview') as Href)
            }
          />
        </SectionPanel>
      </View>
    )
  }

  return (
    <Redirect href={projectTabHref(orgId, projectId, 'overview') as Href} />
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
})
