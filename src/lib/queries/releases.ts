import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  inspectSource,
  createGitlabDeployKey,
  createSource,
  deleteSource,
  fetchGitInstallations,
  fetchInstallationRepositories,
  fetchServiceReleases,
  fetchSource,
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
 * One source with the instance's webhook reachability note folded on.
 *
 * `GET /sources/:id` resolves the instance public-URL list on every call to
 * produce that note, so this is **off by default**: a list of ten repositories
 * must not fan out ten of those reads just to render rows that never show the
 * note. Callers opt in per row when one is actually expanded.
 */
export function useSourceDetail(
  orgId: string,
  sourceId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).sources.detail(sourceId),
    queryFn: () => fetchSource(sourceId),
    enabled:
      (options?.enabled ?? false) && orgId.length > 0 && sourceId.length > 0,
  })
}

/**
 * What is actually in a connected repository, at a ref.
 *
 * **Off by default.** Reading a repository costs a provider round-trip or a
 * clone on a connected server, so it must never fire from merely rendering a
 * picker — the wizard opts in once the operator has chosen a repository and
 * pressed Continue. Keyed by `(sourceId, ref)` so stepping back and forth in
 * the wizard reuses the answer instead of re-reading.
 */
export function useSourceInspection(
  orgId: string,
  sourceId: string,
  ref: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: [...queryKeys.org(orgId).sources.detail(sourceId), 'inspect', ref],
    queryFn: () => inspectSource(sourceId, ref),
    enabled:
      (options?.enabled ?? false) && orgId.length > 0 && sourceId.length > 0,
    // Commit-addressed content; re-reading on a window focus would spend a
    // provider call to learn nothing.
    staleTime: 5 * 60 * 1000,
    retry: false,
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

/**
 * Disconnect a repository from the organization.
 *
 * The instance refuses (**409** `source_referenced_by_compose`) while a stored
 * compose document still names the source, so the caller renders that code as
 * "detach it from the service first" rather than as a failure to retry.
 */
export function useDeleteSource(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (sourceId: string) => deleteSource(sourceId),
    fallbackError: 'Failed to disconnect repository',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).sources.all,
      })
    },
  })
}
