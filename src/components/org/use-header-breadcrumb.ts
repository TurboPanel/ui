import { useMemo } from 'react'
import { usePathname } from 'expo-router'
import {
  breadcrumbRoute,
  databaseBreadcrumb,
  environmentBreadcrumb,
  environmentDeeperPage,
  projectBreadcrumb,
  serverBreadcrumb,
  type Breadcrumb,
} from '@/lib/header-breadcrumb'
import { orEmptyArray } from '@/lib/or-empty-array'
import { parseProjectEnvironmentId } from '@/lib/project-navigation'
import { useContainersByProject } from '@/lib/queries/containers'
import { useEnvironmentConfigViews, useLatestDeployments } from '@/lib/queries/environment-cards'
import { useEnvironments } from '@/lib/queries/environments'
import { useEnvironmentManaged, useManagedStatus } from '@/lib/queries/managed'
import { useProject } from '@/lib/queries/projects'
import { useServerDetail } from '@/lib/queries/servers'
import { environmentDisplayName } from '@/lib/resource-labels'
import type { EnvironmentRecord, ProjectRecord } from '@/lib/instance-api'
import { homeKind, homeProject, wantsConfigView, type ProjectFacts } from '@/lib/v4/projects-home'

/**
 * A managed database's status for the environment in the path, read the way its
 * header reads it (live status, else the stored row) and through the same
 * queries, so the breadcrumb and the header never disagree.
 */
function useManagedFacts(
  orgId: string,
  project: ProjectRecord | undefined,
  environment: EnvironmentRecord | undefined
): ProjectFacts | undefined {
  const environmentId =
    project && homeKind(project) === 'managed' && environment?.serverId ? environment.id : ''
  const detail = useEnvironmentManaged(orgId, environmentId, { enabled: environmentId !== '' })
  const provisioned = Boolean(detail.data?.managed)
  const live = useManagedStatus(orgId, environmentId, { enabled: provisioned })
  const status = live.data?.status ?? detail.data?.managed?.status
  return useMemo(
    () =>
      environmentId && status
        ? { managedRows: [{ environmentId, status, engineDisplayName: null, options: null }] }
        : undefined,
    [environmentId, status]
  )
}

/**
 * The breadcrumb for the page the person is on: a server, project (down to the
 * environment and a deeper page) or managed database. Everything is read through the queries the page itself runs, so the
 * header adds no extra requests once the page has loaded. Null elsewhere, and
 * until the object's name is known.
 */
export function useHeaderBreadcrumb(orgId: string): Breadcrumb | null {
  const pathname = usePathname()
  const route = breadcrumbRoute(pathname, orgId)
  const serverId = route?.kind === 'server' ? route.id : ''
  const projectId = route?.kind === 'project' ? route.id : ''
  const onProject = projectId !== ''
  const environmentId = onProject ? parseProjectEnvironmentId(pathname, projectId) : null

  const server = useServerDetail(orgId, serverId, { enabled: serverId !== '' })
  const projectQuery = useProject(orgId, projectId, { enabled: onProject })
  const environmentsQuery = useEnvironments(orgId, projectId, { enabled: onProject })
  const project = projectQuery.data?.project
  const environments = useMemo(
    () => orEmptyArray(environmentsQuery.data?.environments),
    [environmentsQuery.data?.environments]
  )
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const composeIds = project && wantsConfigView(project) ? environmentIds : []
  const containers = useContainersByProject(orgId, projectId, {
    enabled: onProject,
    environmentIds,
  })
  const { views } = useEnvironmentConfigViews(orgId, composeIds, { enabled: onProject })
  const { latest } = useLatestDeployments(orgId, composeIds, { enabled: onProject })
  const containersByEnvironment = containers.isLoading ? undefined : containers.containersByEnv
  const facts = useManagedFacts(
    orgId,
    project,
    environments.find((env) => env.id === environmentId)
  )

  return useMemo(() => {
    if (route?.kind === 'server') {
      return server.data ? serverBreadcrumb(orgId, server.data) : null
    }
    if (route?.kind === 'project' && project) {
      const card = homeProject({
        project,
        environments,
        containersByEnvironment,
        views,
        latest,
        facts,
      })
      if (card.kind === 'managed') return databaseBreadcrumb(orgId, card.name, card.status)
      const environment = environments.find((env) => env.id === environmentId)
      if (card.kind === 'compose' && environment) {
        return environmentBreadcrumb({
          orgId,
          projectId,
          projectName: card.name,
          environmentId: environment.id,
          environmentName: environmentDisplayName(environment),
          status: card.environments.find((row) => row.id === environment.id)?.status ?? 'unknown',
          page: environmentDeeperPage(pathname, environment.id),
        })
      }
      return projectBreadcrumb(orgId, card.name, card.status)
    }
    return null
  }, [
    orgId,
    pathname,
    projectId,
    environmentId,
    route?.kind,
    server.data,
    project,
    environments,
    containersByEnvironment,
    views,
    latest,
    facts,
  ])
}
