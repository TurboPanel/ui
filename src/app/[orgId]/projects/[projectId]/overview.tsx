import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject } from '@/lib/project-navigation'

/** Overview Base — shared compose. No `?env=` query. */
export default function ProjectOverviewScreen() {
  const { project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
