import { Redirect, type Href } from 'expo-router'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Project-scope Bindings editor — system users + bound databases
 * (`/projects/:projectId/bindings`).
 */
export default function ProjectBindingsScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()

  if (isSystemProject || (project && isManagedProject(project))) {
    return (
      <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
    )
  }
  return <ProjectOverviewTab />
}
