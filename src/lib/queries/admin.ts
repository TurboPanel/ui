import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyPublicUrls,
  applyReencryptSecrets,
  createForge,
  deleteForge,
  fetchEmailSettings,
  fetchForges,
  fetchPublicUrls,
  fetchSignupSettings,
  type ForgeCreate,
  type ForgeUpdate,
  isForbiddenError,
  saveEmailSettings,
  savePublicUrls,
  saveSignupSettings,
  type GithubManifestStartInput,
  startGithubAppManifest,
  syncForge,
  updateForge,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import {
  isControlPlaneRestartError,
  waitForControlPlaneRecovery,
} from '@/lib/control-plane-recovery'
import { samePublicUrlSet } from '@/lib/public-url-entry'
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

/**
 * Client-side ceiling on the apply request. The control plane gives the
 * co-located daemon 180 s, but a connection killed by the Caddy reload can hang
 * far longer than that with nothing on the other end — this bounds it and hands
 * over to the reconnect wait, which finds out what really happened.
 */
const APPLY_REQUEST_DEADLINE_MS = 120_000

async function requestPublicUrlsApply(urls?: string[]): Promise<void> {
  const controller = new AbortController()
  const deadline = setTimeout(() => {
    controller.abort()
  }, APPLY_REQUEST_DEADLINE_MS)
  try {
    await applyPublicUrls(urls, controller.signal)
  } finally {
    clearTimeout(deadline)
  }
}

export type ApplyPublicUrlsVariables = Readonly<{
  urls?: string[]
  /** Fires once the request has died and the reconnect wait starts. */
  onReconnecting?: () => void
}>

export type ApplyPublicUrlsOutcome =
  /** The request survived the reload and the control plane confirmed it. */
  | { kind: 'applied' }
  /** The request died, the control plane came back, and the change is there. */
  | { kind: 'reconnected'; urls: string[] }
  /** It came back, but holding different addresses — the write never landed. */
  | { kind: 'not-saved'; urls: string[] }
  /** It never came back inside the wait window. */
  | { kind: 'unreachable' }

/**
 * Apply public URLs, absorbing the control-plane restart the apply itself
 * causes.
 *
 * Regenerating the certificate reloads Caddy, which drops the connection this
 * request is riding on — an `HTTP 502` from Caddy or the tunnel in front of it,
 * for work that in fact succeeded. So a restart-shaped failure is answered by
 * waiting for the control plane and then *re-reading* the stored URLs, which is
 * both the liveness check and the proof of what landed: the apply route
 * persists before it dispatches to the daemon, so URLs that match the request
 * mean the write went through. Anything the control plane actually answered —
 * a 422 from a non-applying runtime, a 503 with no co-located daemon — still
 * throws.
 */
export function useApplyPublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async ({
      urls,
      onReconnecting,
    }: ApplyPublicUrlsVariables = {}): Promise<ApplyPublicUrlsOutcome> => {
      try {
        await requestPublicUrlsApply(urls)
        return { kind: 'applied' }
      } catch (err) {
        if (!isControlPlaneRestartError(err)) throw err
        onReconnecting?.()
        const recovery = await waitForControlPlaneRecovery({
          probe: fetchPublicUrls,
        })
        if (recovery.kind === 'unreachable') return { kind: 'unreachable' }
        const saved = recovery.value.urls
        if (urls && !samePublicUrlSet(saved, urls)) {
          return { kind: 'not-saved', urls: saved }
        }
        return { kind: 'reconnected', urls: saved }
      }
    },
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
function forgesKey(scope: 'admin' | 'org') {
  if (scope === 'admin') return queryKeys.admin.forges
  return queryKeys.org(getActiveOrganizationId() ?? 'none').forges
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
export function useForges(
  scope: 'admin' | 'org',
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: forgesKey(scope),
    queryFn: () => fetchForges(scope),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateForge(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: ForgeCreate) => createForge(scope, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: forgesKey(scope) })
    },
  })
}

export function useUpdateForge(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ForgeUpdate }) =>
      updateForge(scope, id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: forgesKey(scope) })
    },
  })
}

export function useDeleteForge(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => deleteForge(scope, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: forgesKey(scope) })
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
    mutationFn: (input: GithubManifestStartInput) =>
      startGithubAppManifest(scope, input),
  })
}

/**
 * Reconcile one app against the provider's record of it.
 *
 * Invalidates the list because the name and slug it returns are what the list
 * renders — the whole point is that they may have changed on the provider's
 * side without anything telling us.
 */
export function useSyncForge(scope: 'admin' | 'org') {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => syncForge(scope, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: forgesKey(scope) })
    },
  })
}
