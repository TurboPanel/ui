import { Redirect, type Href } from 'expo-router'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Overview lens — compose topology for Project scope
 * (`/projects/:projectId/map`).
 */
export default function ProjectMapScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()

  if (isSystemProject || (project && isManagedProject(project))) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  return <ProjectOverviewTab />
}
