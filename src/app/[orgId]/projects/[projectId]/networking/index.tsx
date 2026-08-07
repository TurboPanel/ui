import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectEnvironmentHref,
  projectOverviewHref,
  projectTabHref,
} from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

export default function ProjectNetworkingScreen() {
  const {
    orgId,
    projectId,
    project,
    environmentScopeActive,
    selectedEnvironmentId,
  } = useProjectContext()
  if (project && isManagedProject(project)) {
    return (
      <Redirect
        href={projectTabHref(orgId, projectId, 'overview') as Href}
      />
    )
  }
  // Only follow sticky environment scope when it was explicitly active
  // (`/environments/:id`). Do not use the first-env fallback on a cold load.
  if (environmentScopeActive && selectedEnvironmentId) {
    return (
      <Redirect
        href={
          projectEnvironmentHref(orgId, projectId, selectedEnvironmentId) as Href
        }
      />
    )
  }
  return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
}
