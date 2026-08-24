import { Redirect, type Href } from 'expo-router'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  isManagedProject,
  projectOverviewHref,
} from '@/lib/project-navigation'

/**
 * Environment-scope Settings
 * (`/environments/:environmentId/settings`).
 */
export default function ProjectEnvironmentSettingsScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()

  if (isSystemProject) {
    return (
      <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
    )
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}
