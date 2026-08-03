import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'
import { View } from 'react-native'
import { spacing } from '@/lib/theme'

/** Environments tab index (`/environments`) — list / detail section. */
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

  return <ProjectEnvironmentsSection orgId={orgId} projectId={projectId} />
}
