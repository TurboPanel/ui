import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyPublicUrls,
  applyReencryptSecrets,
  createGitApp,
  deleteGitApp,
  fetchEmailSettings,
  fetchGitApps,
  fetchPublicUrls,
  fetchSignupSettings,
  type GitAppCreate,
  type GitAppUpdate,
  isForbiddenError,
  saveEmailSettings,
  savePublicUrls,
  saveSignupSettings,
  startGithubAppManifest,
  updateGitApp,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { getActiveOrganizationId } from '@/lib/org-context'

export function usePublicUrls(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.publicUrls,
    queryFn: fetchPublicUrls,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Dev install-command hint. Manage-gated 403 is swallowed so non-admins are
 * not signed out by the global forbidden handler.
 */
export function usePublicUrlsOptional(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: [...queryKeys.admin.publicUrls, 'optional'] as const,
    queryFn: async () => {
      try {
        return await fetchPublicUrls()
      } catch (err) {
        if (isForbiddenError(err)) {
          return { urls: [] as string[] }
        }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

export function useSavePublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: savePublicUrls,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
    },
  })
}

export function useApplyPublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (urls?: string[]) => applyPublicUrls(urls),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
    },
  })
}

export function useSignupSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.signup,
    queryFn: fetchSignupSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useEmailSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.email,
    queryFn: fetchEmailSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useApplyReencryptSecrets() {
  return useApiMutation({
    mutationFn: (body?: Parameters<typeof applyReencryptSecrets>[0]) =>
      applyReencryptSecrets(body),
  })
}

export function useSaveSignupSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveSignupSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.signup, data)
    },
  })
}

export function useSaveEmailSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveEmailSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.email, data)
    },
  })
}

/**
 * Cache key for one scope's collection.
 *
 * The org list is keyed by the **active organization**, not just by the string
 * `'org'`: it contains that org's own apps plus instance-wide ones, and the
 * `readOnly` flags and webhook URLs differ per org, so a shared key would serve
 * the previous organization's answer after a switch. `apiFetch` resolves the
 * org from the same module global, so the two always agree.
 */
function gitAppsKey(scope: 'admin' | 'org') {
  if (scope === 'admin') return queryKeys.admin.gitApps
  return queryKeys.org(getActiveOrganizationId() ?? 'none').gitApps
}

/**
 * Registered Git provider applications for one scope.
 *
 * `admin` lists the instance-wide collection; `org` lists the organization's
 * own plus every instance-wide one, with `readOnly` marking the latter.
 *
 * These live in `queries/admin` despite serving both surfaces: the two hit the
 * same resource under different prefixes, and splitting them across modules
 * would mean two copies of the cache-invalidation rules for one collection.
 * Org-scoped screens importing from here is deliberate, not a stray import.
 */
export function useGitApps(
  scope: 'admin' | 'org',
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: gitAppsKey(scope),
    queryFn: () => fetchGitApps(scope),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateGitApp(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: GitAppCreate) => createGitApp(scope, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitAppsKey(scope) })
    },
  })
}

export function useUpdateGitApp(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ id, updates }: { id: string; updates: GitAppUpdate }) =>
      updateGitApp(scope, id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitAppsKey(scope) })
    },
  })
}

export function useDeleteGitApp(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => deleteGitApp(scope, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gitAppsKey(scope) })
    },
  })
}

/**
 * Start the GitHub App manifest flow.
 *
 * Returns the manifest and target URL; the caller POSTs them to GitHub as a
 * form. No cache to update — the app row does not exist until the callback.
 */
export function useStartGithubAppManifest(scope: 'admin' | 'org') {
  return useApiMutation({
    mutationFn: (input: {
      name?: string
      baseUrl?: string
      organizationLogin?: string | null
    }) => startGithubAppManifest(scope, input),
  })
}
