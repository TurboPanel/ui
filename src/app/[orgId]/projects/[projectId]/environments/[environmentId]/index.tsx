import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'

/**
 * Overview with a concrete environment selected
 * (`/projects/:projectId/environments/:environmentId`).
 * Highlights that environment (not Base) and edits its overlay / lifecycle.
 */
export default function ProjectEnvironmentOverviewScreen() {
  const { project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
