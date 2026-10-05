import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { View } from 'react-native'
import { EnvironmentConfigurationScreen } from '@/components/org/project/configuration/environment-configuration'
import { useEnvironmentChrome } from '@/components/org/project/environment-shell'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { EnvironmentDeploymentHistoryPanel } from '@/components/org/project/environment-deployment-history-panel'
import { EnvironmentGitSourceSection } from '@/components/org/project/overview-environments-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectEnvironmentsTab } from '@/components/org/project/project-environments-tab'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import {
  isManagedProject,
  legacyProjectRedirectHref,
  projectOverviewHref,
  withCarriedQuery,
  type LegacyProjectSegment,
} from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

// Route files stay a few lines: each names a screen from here. The checks
// (platform and managed projects keep their own pages) live in one place.

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** `/projects/:id/overview` — the Environments tab. */
export function ProjectEnvironmentsScreen() {
  const { project, isSystemProject } = useProjectContext()
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  // Platform projects render their own panel through the shared compose tab.
  if (isSystemProject) return <ProjectOverviewTab />
  return <ProjectEnvironmentsTab />
}

/** The Base tab and its lens routes: the shared compose, as today's project scope. */
export function ProjectBaseScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()
  if (isSystemProject || (project && isManagedProject(project))) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  return <ProjectOverviewTab />
}

/**
 * Environment Overview. Platform projects keep it too: their environment page
 * is the read-only component panel the shared compose tab renders.
 */
export function EnvironmentOverviewScreen() {
  const { project } = useProjectContext()
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}

/** Environment routes that render the compose surface (Configuration, Settings). */
export function EnvironmentComposeScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()
  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <ProjectOverviewTab />
}

/**
 * Environment Configuration: what the environment runs and where each value
 * comes from. Platform and managed projects keep the screens they had.
 */
export function EnvironmentConfigurationTabScreen() {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()
  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  return <EnvironmentConfigurationScreen />
}

/** Environment Settings: the compose settings plus branch and deploy-on-push. */
export function EnvironmentSettingsScreen() {
  const withChrome = useEnvironmentChrome()
  return (
    <View style={{ gap: spacing.lg }}>
      <EnvironmentComposeScreen />
      {withChrome ? <EnvironmentGitSourceSection /> : null}
    </View>
  )
}

/** Environment Deployments: the deploy history, open. */
export function EnvironmentDeploymentsScreen() {
  const { orgId, projectId, project, isSystemProject, pathEnvironmentId } =
    useProjectContext()
  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (project && isManagedProject(project)) {
    return <ManagedFocusTab focus="overview" />
  }
  if (!pathEnvironmentId) return null
  return (
    <EnvironmentDeploymentHistoryPanel
      orgId={orgId}
      environmentId={pathEnvironmentId}
      alwaysOpen
    />
  )
}

/**
 * A retired route (`/compose`, `/services`, `/bindings`, `/hosting`,
 * `/storage`, `/servers`, `/map`, at project or environment scope). Sends the
 * visitor to where that screen lives now and carries the query along
 * (`?hostingId=` is a live deep link).
 */
export function LegacyProjectRedirect({
  segment,
}: Readonly<{ segment: LegacyProjectSegment }>) {
  const { orgId, projectId, project, isSystemProject } = useProjectContext()
  const params = useLocalSearchParams()
  const environmentId = firstParam(params.environmentId) || null
  const managed = project != null && isManagedProject(project)
  if (isSystemProject || (managed && !environmentId)) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (managed) return <ManagedFocusTab focus="overview" />
  const target = legacyProjectRedirectHref(orgId, projectId, segment, environmentId)
  if (!target) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  const href = withCarriedQuery(target, params, [
    'orgId',
    'projectId',
    'environmentId',
  ])
  return <Redirect href={href as Href} />
}
