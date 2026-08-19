import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { restartSystemComponent } from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { useContainers } from '@/lib/queries/containers'
import { useEnvironments } from '@/lib/queries/environments'
import { useProjects } from '@/lib/queries/projects'
import { useServices } from '@/lib/queries/services'
import { useWorkspaces } from '@/lib/queries/workspaces'
import {
  findServerIngressEnvironment,
  findSystemWorkspace,
  SYSTEM_HOSTING_INGRESS_COMPONENT,
  systemComponentKey,
} from '@/lib/system-inventory'
import { orEmptyArray } from '@/lib/or-empty-array'

/**
 * Presentation join over existing workspace → project → environment →
 * container query keys for the per-server hosting-ingress stack.
 * No new timers; `refetchInterval` stays false.
 */
export function useServerSystemIngress(orgId: string, serverId: string) {
  const workspacesQuery = useWorkspaces(orgId, {
    enabled: orgId.length > 0 && serverId.length > 0,
  })
  const systemWorkspace = useMemo(
    () => findSystemWorkspace(workspacesQuery.data?.workspaces ?? []),
    [workspacesQuery.data?.workspaces],
  )
  const workspaceId = systemWorkspace?.id ?? null

  const projectsQuery = useProjects(orgId, workspaceId ?? undefined, {
    enabled: workspaceId != null,
  })
  const ingressProject = useMemo(() => {
    const projects = projectsQuery.data?.projects ?? []
    return (
      projects.find(
        (project) =>
          systemComponentKey(project) === SYSTEM_HOSTING_INGRESS_COMPONENT,
      ) ?? null
    )
  }, [projectsQuery.data?.projects])
  const projectId = ingressProject?.id ?? null

  const environmentsQuery = useEnvironments(orgId, projectId ?? undefined, {
    enabled: projectId != null,
  })
  const environment = useMemo(
    () =>
      findServerIngressEnvironment(
        environmentsQuery.data?.environments ?? [],
        serverId,
      ),
    [environmentsQuery.data?.environments, serverId],
  )
  const environmentId = environment?.id ?? null

  const servicesQuery = useServices(orgId, environmentId ?? undefined, {
    enabled: environmentId != null,
  })
  const service = useMemo(() => {
    const services = servicesQuery.data?.services ?? []
    return services[0] ?? null
  }, [servicesQuery.data?.services])

  const containersQuery = useContainers(
    orgId,
    environmentId ? { environmentId } : undefined,
    {
      enabled: environmentId != null,
      refetchInterval: false,
      keepPreviousData: false,
    },
  )

  const isLoading =
    workspacesQuery.isLoading ||
    (workspaceId != null && projectsQuery.isLoading) ||
    (projectId != null && environmentsQuery.isLoading) ||
    (environmentId != null &&
      (servicesQuery.isLoading || containersQuery.isLoading))

  const error =
    workspacesQuery.error ??
    projectsQuery.error ??
    environmentsQuery.error ??
    servicesQuery.error ??
    containersQuery.error ??
    null

  const containers = orEmptyArray(containersQuery.data?.containers)
  const status = useMemo(() => {
    if (!environment) {
      return 'not_provisioned' as const
    }
    if (containers.length === 0) {
      return 'pending' as const
    }
    const hasDockerId = containers.some(
      (row) => typeof row.containerId === 'string' && row.containerId.length > 0,
    )
    if (!hasDockerId) {
      return 'pending' as const
    }
    if (containers.some((row) => row.status === 'running')) {
      return 'running' as const
    }
    if (
      containers.some(
        (row) =>
          row.status === 'exited' ||
          row.status === 'dead' ||
          row.status === 'removing',
      )
    ) {
      return 'exited' as const
    }
    return 'pending' as const
  }, [containers, environment])

  return {
    workspaceId,
    projectId,
    environment,
    service,
    containers,
    status,
    isLoading,
    error,
  }
}

export function useRestartSystemComponent(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (component: string) =>
      restartSystemComponent(serverId, component),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}
