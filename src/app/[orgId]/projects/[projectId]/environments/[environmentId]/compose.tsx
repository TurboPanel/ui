import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'

/**
 * Environment-scope Compose YAML editor
 * (`/environments/:environmentId/compose`).
 */
export default function ProjectEnvironmentComposeScreen() {
  const { project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
