import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  createGitlabDeployKey,
  createSource,
  fetchGitInstallations,
  fetchInstallationRepositories,
  fetchServiceReleases,
  fetchSources,
  rollbackEnvironment,
  updateSource,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Git-backed releases for one compose service.
 *
 * No `refetchInterval`, exactly like `useEnvironmentDeployments`: a release row
 * only appears when a deploy or rollback command finishes, and the panel that
 * renders it already tracks those commands with `useCommandsBatch` and
 * invalidates this key when one reaches a terminal status. Polling on top of
 * that would be a second, slower source of the same truth.
 */
export function useServiceReleases(
  orgId: string,
  environmentId: string,
  composeServiceName?: string,
  options?: Readonly<{ enabled?: boolean; limit?: number }>,
) {
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .environments.releases(environmentId, composeServiceName),
    queryFn: () =>
      fetchServiceReleases(environmentId, composeServiceName, {
        ...(options?.limit ? { limit: options.limit } : {}),
      }),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      environmentId.length > 0,
    refetchInterval: false,
  })
}

/**
 * Invalidate every releases list for one environment.
 *
 * Exported because the rollback the panel enqueues is not the only thing that
 * produces a release — an ordinary deploy does too, and both land on the same
 * key prefix.
 */
export async function invalidateEnvironmentReleases(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId: string,
) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.org(orgId).environments.releases(environmentId),
    // The service-scoped keys hang off the unscoped one only by prefix up to
    // the service segment, so match the environment's whole releases subtree.
    exact: false,
  })
}

/**
 * Re-promote an already-published release for one service.
 *
 * The response is an ordinary command enqueue — the control plane does not fork
 * a second command type for rollback — so callers feed `commandId` into the
 * same `useCommandsBatch` tracking the deploy toolbar uses.
 */
export function useRollbackEnvironment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { composeServiceName: string; releaseId: string }) =>
      rollbackEnvironment(environmentId, body),
    fallbackError: 'Rollback failed',
    onSuccess: async () => {
      await invalidateEnvironmentReleases(queryClient, orgId, environmentId)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).environments.deployments(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).containers.all,
        }),
      ])
    },
  })
}

/** Org-owned Git repository bindings a compose service can attach to. */
export function useSources(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).sources.list,
    queryFn: fetchSources,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/**
 * Provider connections this organization can read repositories through —
 * GitHub App installations and connected GitLab accounts alike. Callers that
 * render one provider's picker filter on `provider` themselves.
 */
export function useGitInstallations(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).sources.installations,
    queryFn: fetchGitInstallations,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/**
 * Repositories visible to one connection. Every read mints a short-lived
 * provider credential on the instance, so this is deliberately only fetched
 * once a picker is actually open (`enabled`).
 */
export function useInstallationRepositories(
  orgId: string,
  installationId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).sources.repositories(installationId),
    queryFn: () => fetchInstallationRepositories(installationId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      installationId.length > 0,
  })
}

/**
 * Register a repository as a source and return its id.
 *
 * The compose binding stores only `sourceId`, so connecting a repository to a
 * service is two steps: create the row here, then write the id into
 * `x-turbopanel.source` on the service.
 */
export function useCreateSource(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createSource>[0]) => createSource(body),
    fallbackError: 'Failed to connect repository',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    },
  })
}

/**
 * Mint a read-only deploy keypair for a GitLab source that will not use OAuth.
 *
 * Not a query: it *creates* a credential, and the public half it returns is
 * shown once and never fetched again. The caller keeps the `credentialId` to
 * pass to `useCreateSource`, and shows the operator the public key to paste
 * into the project's Deploy Keys.
 */
export function useCreateGitlabDeployKey(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createGitlabDeployKey>[0]) =>
      createGitlabDeployKey(body),
    fallbackError: 'Failed to generate a deploy key',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    },
  })
}

/**
 * Patch a `source` row — today the auto-deploy policy.
 *
 * The policy lives on the source, not on the compose binding: one repository
 * connected to several services has one policy, and the webhook surface reads
 * it from the row. Editing it from a service's Source section therefore affects
 * every service bound to that repository, which the section says out loud.
 */
export function useUpdateSource(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (vars: {
      sourceId: string
      patch: Parameters<typeof updateSource>[1]
    }) => updateSource(vars.sourceId, vars.patch),
    fallbackError: 'Failed to update source',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    },
  })
}
