import { Redirect, type Href } from 'expo-router'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Project-scope Compose YAML editor
 * (`/projects/:projectId/compose`).
 */
export default function ProjectComposeScreen() {
  const { orgId, projectId, project } = useProjectContext()

  if (project && isManagedProject(project)) {
    return (
      <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
    )
  }
  return <ProjectOverviewTab />
}
