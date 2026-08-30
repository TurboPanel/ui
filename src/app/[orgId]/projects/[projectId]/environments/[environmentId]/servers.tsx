import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectEnvironmentHostingHref,
  projectHostingHref,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Retired route — server placement lives on the Hosting tab
 * (`/environments/:environmentId/hosting`).
 */
export default function ProjectEnvironmentServersScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()
  const { environmentId } = useLocalSearchParams<{ environmentId?: string }>()

  if (isSystemProject) {
    return (
      <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
    )
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  const href =
    typeof environmentId === 'string' && environmentId
      ? projectEnvironmentHostingHref(orgId, projectId, environmentId)
      : projectHostingHref(orgId, projectId)
  return <Redirect href={href as Href} />
}
