import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  inspectRepository,
  createGitlabDeployKey,
  createRepository,
  attachRepository,
  deleteRepository,
  fetchGitConnections,
  fetchConnectionRepositories,
  fetchServiceReleases,
  fetchRepository,
  fetchRepositories,
  isForbiddenError,
  refreshRepository,
  rollbackEnvironment,
  updateRepository,
  type RepositoryRecord,
} from '@/lib/instance-api'
import { repositoryShortName } from '@/lib/repository-label'
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

/** Stable empty result so a disabled/forbidden read never thrashes consumers. */
const EMPTY_REPOSITORY_LABELS: Readonly<Record<string, string>> = {}

/**
 * Repository short names (`repo`, `.git` stripped) keyed by repository id,
 * for surfaces every member can see — the Overview diagram names the
 * repository a service builds from. The repositories read can be
 * manage-gated, so a forbidden response resolves to an empty map instead of
 * reaching the global forbidden recovery; the diagram then falls back to its
 * compose-only wording. Uses its own query key: the strict
 * {@link useRepositories} list must never be served this hook's
 * swallowed-403 empty result.
 */
export function useRepositoryLabelsById(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
): Readonly<Record<string, string>> {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).repositories.labels,
    queryFn: async (): Promise<Record<string, string>> => {
      try {
        const { repositories } = await fetchRepositories()
        return Object.fromEntries(
          repositories.map((row) => [row.id, repositoryShortName(row)]),
        )
      } catch (err) {
        if (isForbiddenError(err)) return {}
        throw err
      }
    },
    retry: false,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
  return query.data ?? EMPTY_REPOSITORY_LABELS
}

/** Org-owned Git repository bindings a compose service can attach to. */
export function useRepositories(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).repositories.list,
    queryFn: fetchRepositories,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/**
 * One repository with the instance's webhook reachability note folded on.
 *
 * `GET /repositories/:id` resolves the instance public-URL list on every call
 * to produce that note, so this is **off by default**: a list of ten
 * repositories must not fan out ten of those reads just to render rows that
 * never show the note. Callers opt in per row when one is actually expanded.
 */
export function useRepositoryDetail(
  orgId: string,
  repositoryId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).repositories.detail(repositoryId),
    queryFn: () => fetchRepository(repositoryId),
    enabled:
      (options?.enabled ?? false) && orgId.length > 0 && repositoryId.length > 0,
  })
}

/**
 * What is actually in a connected repository, at a ref.
 *
 * **Off by default.** Reading a repository costs a provider round-trip or a
 * clone on a connected server, so it must never fire from merely rendering a
 * picker — the wizard opts in once the operator has chosen a repository and
 * pressed Continue. Keyed by `(repositoryId, ref)` so stepping back and forth
 * in the wizard reuses the answer instead of re-reading.
 */
export function useRepositoryInspection(
  orgId: string,
  repositoryId: string,
  ref: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: [...queryKeys.org(orgId).repositories.detail(repositoryId), 'inspect', ref],
    queryFn: () => inspectRepository(repositoryId, ref),
    enabled:
      (options?.enabled ?? false) && orgId.length > 0 && repositoryId.length > 0,
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
export function useGitConnections(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).repositories.connections,
    queryFn: fetchGitConnections,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/**
 * Repositories visible to one connection. Every read mints a short-lived
 * provider credential on the instance, so this is deliberately only fetched
 * once a picker is actually open (`enabled`).
 */
export function useConnectionRepositories(
  orgId: string,
  connectionId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).repositories.connectionRepositories(connectionId),
    queryFn: () => fetchConnectionRepositories(connectionId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      connectionId.length > 0,
  })
}

/**
 * Register a repository and return its id.
 *
 * The compose binding stores only `sourceId` (compose document field,
 * intentionally still named `source`), so connecting a repository to a
 * service is two steps: create the row here, then write the id into
 * `x-turbopanel.source` on the service.
 *
 * Idempotent server-side: the result carries `reused: true` when the
 * organization already held this URL, and callers surface that rather than
 * pretending a new row appeared.
 */
/**
 * Bind a clone URL to this organization and return the row.
 *
 * Create only returns `{ id }`, same as attach — the clone-URL lane fetches
 * the row the same way `useAttachRepository` does so the picked-repository
 * card can show the same label and access badge immediately, instead of
 * waiting on the list refetch below to catch up.
 */
export function useCreateRepository(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (body: Parameters<typeof createRepository>[0]) => {
      const created = await createRepository(body)
      const { repository } = await fetchRepository(created.id)
      return { ...created, repository }
    },
    fallbackError: 'Failed to connect repository',
    onSuccess: async (data) => {
      const listKey = queryKeys.org(orgId).repositories.list
      queryClient.setQueryData(
        listKey,
        (current: { repositories: RepositoryRecord[] } | undefined) => {
          const repositories = current?.repositories ?? []
          if (repositories.some((row) => row.id === data.repository.id)) {
            return current ?? { repositories }
          }
          return { repositories: [...repositories, data.repository] }
        },
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}

/**
 * Bind a provider repository to this organization and return the row.
 *
 * Attach only returns `{ id }`. The project wizard gates Continue on the
 * cached `useRepositories()` list, so this fetches the row, writes it into
 * that list, then invalidates so other consumers refetch.
 */
export function useAttachRepository(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (input: Parameters<typeof attachRepository>[0]) => {
      const attached = await attachRepository(input)
      const { repository } = await fetchRepository(attached.id)
      return { ...attached, repository }
    },
    fallbackError: 'Could not attach the repository',
    onSuccess: async (data) => {
      const listKey = queryKeys.org(orgId).repositories.list
      queryClient.setQueryData(
        listKey,
        (current: { repositories: RepositoryRecord[] } | undefined) => {
          const repositories = current?.repositories ?? []
          if (repositories.some((row) => row.id === data.repository.id)) {
            return current ?? { repositories }
          }
          return { repositories: [...repositories, data.repository] }
        },
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}

/**
 * Mint a read-only deploy keypair for a GitLab repository that will not use OAuth.
 *
 * Not a query: it *creates* a secret, and the public half it returns is
 * shown once and never fetched again. The caller keeps the `secretId` to
 * pass to `useCreateRepository`, and shows the operator the public key to paste
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
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}

/**
 * Patch a `repository` row — today the auto-deploy policy.
 *
 * The policy lives on the repository, not on the compose binding: one
 * repository connected to several services has one policy, and the webhook
 * surface reads it from the row. Editing it from a service's Source section
 * therefore affects every service bound to that repository, which the section
 * says out loud.
 */
export function useUpdateRepository(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (vars: {
      repositoryId: string
      patch: Parameters<typeof updateRepository>[1]
    }) => updateRepository(vars.repositoryId, vars.patch),
    fallbackError: 'Failed to update repository',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}

/**
 * Re-read the provider's current facts (default branch) for one repository.
 *
 * Manage-gated server-side; only meaningful for rows with a `connectionId`.
 * The refreshed row comes back in the response, so the list cache is patched
 * in place before the invalidation refetch settles.
 */
export function useRefreshRepository(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (repositoryId: string) => refreshRepository(repositoryId),
    fallbackError: 'Failed to refresh repository',
    onSuccess: async (data) => {
      const listKey = queryKeys.org(orgId).repositories.list
      queryClient.setQueryData(
        listKey,
        (current: { repositories: RepositoryRecord[] } | undefined) => {
          if (!current) return current
          return {
            repositories: current.repositories.map((row) =>
              row.id === data.repository.id ? data.repository : row,
            ),
          }
        },
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}

/**
 * Disconnect a repository from the organization.
 *
 * The instance refuses (**409** `source_referenced_by_compose`) while a stored
 * compose document still names the repository, so the caller renders that code
 * as "detach it from the service first" rather than as a failure to retry.
 */
export function useDeleteRepository(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (repositoryId: string) => deleteRepository(repositoryId),
    fallbackError: 'Failed to disconnect repository',
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).repositories.all,
      })
    },
  })
}
