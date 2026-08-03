import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'
import { View } from 'react-native'
import { spacing } from '@/lib/theme'

/**
 * Environments tab index (`/environments`).
 * Managed: list + focus panel. Compose: redirect to Overview (env work lives
 * under Project / environment chips + Networking / Storage).
 */
export default function ProjectEnvironmentsScreen() {
  const { orgId, projectId, project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return (
      <View style={{ gap: spacing.lg }}>
        <ProjectEnvironmentsSection
          orgId={orgId}
          projectId={projectId}
          embedDetail={false}
        />
        <ManagedFocusTab focus="environments" />
      </View>
    )
  }

  return (
    <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  )
}
