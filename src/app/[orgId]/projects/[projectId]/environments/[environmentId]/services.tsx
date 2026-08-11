import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'

/**
 * Environment-scope Services (visual) editor
 * (`/environments/:environmentId/services`).
 */
export default function ProjectEnvironmentServicesScreen() {
  const { project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
