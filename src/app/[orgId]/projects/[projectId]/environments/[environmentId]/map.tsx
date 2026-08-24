import { Redirect, type Href } from 'expo-router'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Map lens — compose topology for one environment
 * (`/environments/:environmentId/map`).
 */
export default function ProjectEnvironmentMapScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()

  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
