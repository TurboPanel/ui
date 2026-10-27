import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
  applyPublicUrls,
  applyReencryptSecrets,
  attachInstanceCertificate,
  fetchInstanceAcmeSettings,
  fetchInstanceCertificates,
  fetchInstanceDaemon,
  fetchInstanceHostnames,
  fetchInstanceUpdates,
  fetchUpgradeActiveRun,
  fetchUpgradeHistory,
  fetchUpgradeRunServers,
  fetchUpgradeServersPage,
  fetchUpgradeSettings,
  pauseUpdates,
  resumeUpdates,
  saveUpgradeSettings,
  type UpdatesPauseResult,
  type UpgradeSettings,
  type UpgradeHistoryQuery,
  type UpgradeRunServersQuery,
  fetchPlatformCa,
  fetchTrustedProxies,
  type InstanceHostnameInput,
  type InstanceHostnameRecord,
  reconcilePlatformCaTrust,
  saveInstanceAcmeSettings,
  saveInstanceHostnames,
  setInstanceTunnelToken,
  uploadInstanceCertificate,
  type AdminTierCreateBody,
  type AdminTierPatchBody,
  createAdminTier,
  createForge,
  deactivateAdminTier,
  deleteForge,
  fetchAdminTierProducts,
  fetchAdminTiers,
  fetchAuthProviderSettings,
  fetchEmailSettings,
  fetchForgeWebhookOrigins,
  fetchForges,
  fetchPublicUrls,
  fetchServerMetricsLiveSettings,
  fetchSignupSettings,
  type ForgeCreate,
  type ForgeWebhookOrigins,
  type ForgeUpdate,
  isForbiddenError,
  isHttpStatusError,
  patchAdminTier,
  saveAuthProviderSettings,
  saveEmailSettings,
  savePublicUrls,
  saveServerMetricsLiveSettings,
  saveSignupSettings,
  type GithubManifestStartInput,
  startGithubAppManifest,
  syncForge,
  updateForge,
  verifyAdminTier,
  verifyAllAdminTiers,
} from '@/lib/instance-api'
import {
  raceWindow,
  settleIssuance,
  takeIssuanceBaseline,
  type IssuanceBaseline,
} from '@/lib/issuance-settle'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import {
  draftUsesLetsEncryptSource,
  type HostnameSourceDraft,
  letsEncryptSaveBlockedMessage,
} from '@/lib/instance-certificates'
import {
  isControlPlaneRestartError,
  waitForControlPlaneRecovery,
} from '@/lib/control-plane-recovery'
import { getActiveOrganizationId } from '@/lib/org-context'
import { isManagedUpgradeApiMissing } from '@/lib/upgrade-api'
import { isUpgradeRunActive, UPGRADE_RUN_POLL_MS } from '@/lib/upgrade-run-poll'

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

/** Last segment of every webhook-origins key, whatever the scope or organization. */
const WEBHOOK_ORIGINS_SEGMENT = 'webhook-origins'

/**
 * Refetch every webhook-origins read. Those keys sit under the forges keys
 * (per scope, per organization), not under the public URL key, so the
 * public URL and hostname writes have to name them or the wizard keeps an
 * empty list after "add a public URL, then come back".
 */
function invalidateForgeWebhookOrigins(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey.at(-1) === WEBHOOK_ORIGINS_SEGMENT,
  })
}

export function useSavePublicUrls() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: savePublicUrls,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.publicUrls,
        }),
        invalidateForgeWebhookOrigins(queryClient),
      ])
    },
  })
}

/**
 * Client-side ceiling on the apply request. The control plane gives the
 * co-located daemon 180 s (the issuer waits up to 180 s too), so this must
 * stay longer than that or a slow issuance is cut off and misread. A
 * connection killed by the Caddy reload can hang far longer than that with
 * nothing on the other end — this bounds it and hands over to the reconnect
 * wait, which finds out what really happened.
 */
const APPLY_REQUEST_DEADLINE_MS = 200_000

async function requestPublicUrlsApply(): Promise<void> {
  const controller = new AbortController()
  const deadline = setTimeout(() => {
    controller.abort()
  }, APPLY_REQUEST_DEADLINE_MS)
  try {
    await applyPublicUrls(undefined, controller.signal)
  } finally {
    clearTimeout(deadline)
  }
}

export type ApplyPublicUrlsVariables = Readonly<{
  /**
   * The hostname set just saved. Compared against the recovery probe.
   * Omit it and a restart that comes back counts as reconnected.
   */
  hostnames?: readonly InstanceHostnameInput[]
  /** Fires once the request has died and the reconnect wait starts. */
  onReconnecting?: () => void
}>

export type ApplyPublicUrlsOutcome =
  /** The request survived the reload and the control plane confirmed it. */
  | { kind: 'applied' }
  /** The request died, the control plane came back, and the change is there. */
  | {
      kind: 'reconnected'
      hostnames: InstanceHostnameInput[]
      /** An earlier certificate stands; no new one was confirmed. */
      kept: boolean
    }
  /** It came back, but a Let's Encrypt name has no certificate or a fresh error. */
  | { kind: 'not-issued'; hostnames: InstanceHostnameInput[]; error: string }
  /** It came back, but holding a different set — the write never landed. */
  | { kind: 'not-saved'; hostnames: InstanceHostnameInput[] }
  /** It never came back inside the wait window. */
  | { kind: 'unreachable' }

/** How long the read before the apply may take; past it the baseline is unknown. */
const BASELINE_READ_MS = 10_000

/**
 * Rows as the server holds them just before the apply, so the wait afterwards
 * compares server values with server values. Only a Let's Encrypt name needs
 * it. A read that fails or hangs gives `null` (unknown), never an empty
 * snapshot: an unknown baseline accepts no earlier certificate as proof.
 */
async function issuanceBaselineBeforeApply(
  hostnames: readonly InstanceHostnameInput[] | undefined,
  signal: AbortSignal
): Promise<IssuanceBaseline> {
  if (hostnames && !hostnames.some((entry) => entry.source === 'lets-encrypt')) {
    return new Map()
  }
  try {
    const read = await raceWindow(fetchInstanceHostnames({ signal }), BASELINE_READ_MS, signal)
    return read ? takeIssuanceBaseline(read.hostnames) : null
  } catch {
    return null
  }
}

function hostnameIdentity(entry: {
  host: string
  source: string
  uploadedCertId?: string | null
}): string {
  return `${entry.host}\0${entry.source}\0${entry.uploadedCertId ?? ''}`
}

function sameHostnameSet(
  saved: readonly InstanceHostnameRecord[],
  expected: readonly InstanceHostnameInput[]
): boolean {
  const left = saved.map(hostnameIdentity).sort((a, b) => a.localeCompare(b))
  const right = expected.map(hostnameIdentity).sort((a, b) => a.localeCompare(b))
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function hostnameInputs(records: readonly InstanceHostnameRecord[]): InstanceHostnameInput[] {
  return records.map((record) => ({
    host: record.host,
    source: record.source,
    uploadedCertId: record.uploadedCertId,
  }))
}

/**
 * Apply public URLs, absorbing the control-plane restart the apply itself
 * causes.
 *
 * Regenerating the certificate reloads Caddy, which drops the connection this
 * request is riding on — an `HTTP 502` from Caddy or the tunnel in front of it,
 * for work that in fact succeeded. So a restart-shaped failure is answered by
 * waiting for the control plane and then *re-reading* the stored hostnames,
 * which is both the liveness check and the proof of what landed. Apply is
 * called with no body so stored per-hostname sources survive — sending `urls`
 * would reset every source to the Platform CA. Anything the control plane
 * actually answered — a 422 from a non-applying runtime, a 503 with no
 * co-located daemon — still throws.
 */
export function useApplyPublicUrls() {
  const queryClient = useQueryClient()
  // Every apply in flight; all of them stop waiting when the screen goes away.
  const waiting = useRef(new Set<AbortController>())
  useEffect(() => {
    const pending = waiting.current
    return () => pending.forEach((controller) => controller.abort())
  }, [])
  return useApiMutation({
    mutationFn: async ({
      hostnames,
      onReconnecting,
    }: ApplyPublicUrlsVariables = {}): Promise<ApplyPublicUrlsOutcome> => {
      const controller = new AbortController()
      waiting.current.add(controller)
      try {
        return await applyAndConfirm({ hostnames, onReconnecting }, controller.signal)
      } finally {
        waiting.current.delete(controller)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceHostnames,
      })
      await invalidateForgeWebhookOrigins(queryClient)
    },
  })
}

async function applyAndConfirm(
  { hostnames, onReconnecting }: ApplyPublicUrlsVariables,
  signal: AbortSignal
): Promise<ApplyPublicUrlsOutcome> {
  const baseline = await issuanceBaselineBeforeApply(hostnames, signal)
  try {
    await requestPublicUrlsApply()
    return { kind: 'applied' }
  } catch (err) {
    if (!isControlPlaneRestartError(err)) throw err
    onReconnecting?.()
    const recovery = await waitForControlPlaneRecovery({
      probe: () => fetchInstanceHostnames(),
    })
    if (recovery.kind === 'unreachable') return { kind: 'unreachable' }
    const saved = hostnameInputs(recovery.value.hostnames)
    if (hostnames && !sameHostnameSet(recovery.value.hostnames, hostnames)) {
      return { kind: 'not-saved', hostnames: saved }
    }
    const issuance = await settleIssuance({
      rows: recovery.value.hostnames,
      baseline,
      signal,
      refetch: async (readSignal) =>
        (await fetchInstanceHostnames({ signal: readSignal })).hostnames,
    })
    if (issuance.kind === 'not-issued') {
      return { kind: 'not-issued', hostnames: saved, error: issuance.error }
    }
    return { kind: 'reconnected', hostnames: saved, kept: issuance.kept }
  }
}

function invalidateHostnameProjection(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.instanceHostnames }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.publicUrls }),
    invalidateForgeWebhookOrigins(queryClient),
  ])
}

export function useInstanceHostnames(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.instanceHostnames,
    queryFn: fetchInstanceHostnames,
    enabled: options?.enabled ?? true,
  })
}

export function useSaveInstanceHostnames() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveInstanceHostnames,
    onSuccess: async () => {
      await invalidateHostnameProjection(queryClient)
    },
  })
}

export function useInstanceCertificates(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.instanceCertificates,
    queryFn: fetchInstanceCertificates,
    enabled: options?.enabled ?? true,
  })
}

export function useUploadInstanceCertificate() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: uploadInstanceCertificate,
    onSuccess: async () => {
      await invalidateHostnameProjection(queryClient)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceCertificates,
      })
    },
  })
}

export function useAttachInstanceCertificate() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { id: string; hosts: string[] }) =>
      attachInstanceCertificate(input.id, input.hosts),
    onSuccess: async () => {
      await invalidateHostnameProjection(queryClient)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceCertificates,
      })
    },
  })
}

export function useInstanceAcmeSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.instanceAcme,
    queryFn: fetchInstanceAcmeSettings,
    enabled: options?.enabled ?? true,
  })
}

/**
 * The save-time Let's Encrypt terms check. Returns a refusal sentence for a
 * hostname set that stores a Let's Encrypt row while the server says the
 * terms are not accepted, is still being asked, or could not be asked;
 * `null` when the save may go ahead.
 */
export function useLetsEncryptTermsGuard(): (
  rows: readonly HostnameSourceDraft[]
) => string | null {
  const acme = useInstanceAcmeSettings()
  return (rows) =>
    letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: draftUsesLetsEncryptSource(rows),
      acme: { data: acme.data, isError: acme.isError },
    })
}

export function useSaveInstanceAcmeSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveInstanceAcmeSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.instanceAcme, data)
    },
  })
}

export function useUpgradeActiveRun(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.upgradeActiveRun,
    queryFn: async () => {
      try {
        return await fetchUpgradeActiveRun()
      } catch (err) {
        if (isManagedUpgradeApiMissing(err)) return { ok: true, run: null }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    refetchInterval: (query) => {
      const run = query.state.data?.run
      return run && isUpgradeRunActive(run.status) ? UPGRADE_RUN_POLL_MS : false
    },
  })
}

/**
 * Poll only while a run is active. An available update is not a reason to
 * poll — nothing changes until a run starts — and comparing installed and
 * target identities here used to spin a 2 s loop whenever the ui's reading of
 * "behind" disagreed with the server's.
 */
export function instanceUpdatesPollInterval(activeRunStatus: string | undefined): number | false {
  if (activeRunStatus && isUpgradeRunActive(activeRunStatus as 'running')) {
    return UPGRADE_RUN_POLL_MS
  }
  return false
}

export function useInstanceUpdates(
  options?: Readonly<{
    enabled?: boolean
    /** The commit this console bundle was built from; see `fetchInstanceUpdates`. */
    consoleCommit?: string
  }>
) {
  const activeRun = useUpgradeActiveRun({ enabled: options?.enabled ?? true })
  return useQuery({
    queryKey: queryKeys.admin.instanceUpdates,
    queryFn: () => fetchInstanceUpdates(options?.consoleCommit),
    enabled: options?.enabled ?? true,
    refetchInterval: () => instanceUpdatesPollInterval(activeRun.data?.run?.status),
  })
}

export function useUpgradeSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.upgradeSettings,
    queryFn: async () => {
      try {
        return await fetchUpgradeSettings()
      } catch (err) {
        if (isManagedUpgradeApiMissing(err)) return null
        throw err
      }
    },
    enabled: options?.enabled ?? true,
  })
}

export function useSaveUpgradeSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (settings: UpgradeSettings) => saveUpgradeSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.upgradeSettings })
    },
  })
}

/**
 * History and run-server pages are paged SQL reads over a whole fleet, so they
 * refresh at a calmer pace than the active-run progress panel.
 */
const UPGRADE_HISTORY_POLL_MS = 5_000

export function useUpgradeHistory(
  page: UpgradeHistoryQuery & Readonly<{ offset: number; limit: number }>,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.admin.upgradeHistory(
      page.offset,
      page.limit,
      page.status ?? '',
      page.trigger ?? ''
    ),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => isUpgradeRunActive(run.status))
        ? UPGRADE_HISTORY_POLL_MS
        : false,
    queryFn: async () => {
      try {
        return await fetchUpgradeHistory(page)
      } catch (err) {
        if (isManagedUpgradeApiMissing(err)) {
          return { ok: true, runs: [], total: 0 }
        }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
  })
}

/**
 * One page of a run's servers (one row per server). Polls while the run is
 * still going; never loads every step of the run.
 */
export function useUpgradeRunServers(
  runId: string,
  query: UpgradeRunServersQuery,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.admin.upgradeRunServers(runId, JSON.stringify(query)),
    queryFn: async () => await fetchUpgradeRunServers(runId, query),
    enabled: (options?.enabled ?? true) && runId !== '',
    placeholderData: keepPreviousData,
    refetchInterval: (state) => {
      const run = state.state.data?.run
      return run && isUpgradeRunActive(run.status) ? UPGRADE_HISTORY_POLL_MS : false
    },
  })
}

export function useUpgradeServersPage(
  page: Readonly<{ offset: number; limit: number; status: string }>,
  options?: Readonly<{ enabled?: boolean }>
) {
  const activeRun = useUpgradeActiveRun({ enabled: options?.enabled ?? true })
  return useQuery({
    queryKey: queryKeys.admin.upgradeServers(page.offset, page.limit, page.status),
    queryFn: async () => {
      try {
        return await fetchUpgradeServersPage(page)
      } catch (err) {
        if (isManagedUpgradeApiMissing(err)) {
          return { ok: true, servers: [], total: 0 }
        }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    refetchInterval:
      activeRun.data?.run && isUpgradeRunActive(activeRun.data.run.status)
        ? UPGRADE_RUN_POLL_MS
        : false,
  })
}

/**
 * Pause or resume all updates, then read the status again: the whole
 * `instance-updates` prefix (status, active run, recent runs), since a pause
 * can end the run in progress as cancelled.
 */
function usePauseToggle(request: () => Promise<UpdatesPauseResult>) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: request,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.instanceUpdates })
    },
  })
}

export function usePauseUpdates() {
  return usePauseToggle(pauseUpdates)
}

export function useResumeUpdates() {
  return usePauseToggle(resumeUpdates)
}

/** Capability gate. `staleTime` and no interval — this must not be polled. */
export function useInstanceDaemon(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.instanceDaemon,
    queryFn: fetchInstanceDaemon,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePlatformCa(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.platformCa,
    queryFn: fetchPlatformCa,
    enabled: options?.enabled ?? true,
  })
}

export function useReconcilePlatformCaTrust() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: reconcilePlatformCaTrust,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformCa })
    },
  })
}

export function useTrustedProxies(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.trustedProxies,
    queryFn: fetchTrustedProxies,
    enabled: options?.enabled ?? true,
  })
}

export function useSetInstanceTunnelToken() {
  return useApiMutation({
    mutationFn: setInstanceTunnelToken,
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
    mutationFn: (body?: Parameters<typeof applyReencryptSecrets>[0]) => applyReencryptSecrets(body),
  })
}

export function useServerMetricsLiveSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.metricsLiveSettings,
    queryFn: fetchServerMetricsLiveSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useSaveServerMetricsLiveSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveServerMetricsLiveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.metricsLiveSettings, data)
    },
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

export function useAuthProviderSettings(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.authProviders,
    queryFn: fetchAuthProviderSettings,
    enabled: options?.enabled ?? true,
  })
}

export function useSaveAuthProviderSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: saveAuthProviderSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.admin.authProviders, data)
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
export function useForges(scope: 'admin' | 'org', options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: forgesKey(scope),
    queryFn: () => fetchForges(scope),
    enabled: options?.enabled ?? true,
  })
}

/**
 * Where a new app may deliver webhooks, for the GitHub App wizard and the
 * app detail page.
 *
 * Reads `GET …/forges/webhook-origins` on the same surface as the collection,
 * so an organization manager does not need the admin-only public URL list. A
 * control plane that predates that route answers 404; the admin public URL
 * list (403 → empty) stands in, as it did before. A 403 is answered with an
 * empty list rather than signing the person out, like `usePublicUrlsOptional`.
 */
export function useForgeWebhookOrigins(
  scope: 'admin' | 'org',
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: [...forgesKey(scope), WEBHOOK_ORIGINS_SEGMENT] as const,
    queryFn: async (): Promise<ForgeWebhookOrigins> => {
      try {
        return await fetchForgeWebhookOrigins(scope)
      } catch (err) {
        if (isForbiddenError(err)) return { origins: [], platformManaged: false }
        if (!isHttpStatusError(err, 404)) throw err
      }
      try {
        return { origins: (await fetchPublicUrls()).urls, platformManaged: false }
      } catch (err) {
        if (isForbiddenError(err)) return { origins: [], platformManaged: false }
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    retry: false,
    // Networking may be in another tab: opening the wizard again rereads.
    refetchOnMount: 'always',
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
    mutationFn: (input: GithubManifestStartInput) => startGithubAppManifest(scope, input),
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

// ---------------------------------------------------------------------------
// Tier catalogue (root only, hosted only)
//
// A row binds a ladder label to a provider product; the server verifies the
// product before writing. Every write invalidates the list and the product
// list, because a binding moves `products[].tierId` and a verify refreshes
// the row's cached price.
// ---------------------------------------------------------------------------

export function useAdminTiers(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.tiers,
    queryFn: fetchAdminTiers,
    enabled: options?.enabled ?? true,
  })
}

/** The provider's products — one round trip to Stripe, so not refetched on every focus. */
export function useAdminTierProducts(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.admin.tierProducts,
    queryFn: fetchAdminTierProducts,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: false,
  })
}

async function invalidateTierCatalogue(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.tiers }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.tierProducts }),
  ])
}

export function useCreateAdminTier() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: AdminTierCreateBody) => createAdminTier(body),
    fallbackError: 'Could not save the tier',
    onSuccess: async () => {
      await invalidateTierCatalogue(queryClient)
    },
  })
}

export function usePatchAdminTier() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (vars: Readonly<{ id: string; body: AdminTierPatchBody }>) =>
      patchAdminTier(vars.id, vars.body),
    fallbackError: 'Could not save the tier',
    onSuccess: async () => {
      await invalidateTierCatalogue(queryClient)
    },
  })
}

export function useDeactivateAdminTier() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (vars: Readonly<{ id: string }>) => deactivateAdminTier(vars.id),
    fallbackError: 'Could not retire the tier',
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.tiers })
    },
  })
}

/** Verifying writes the cached price back onto the row, so the list is re-read. */
export function useVerifyAdminTier() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => verifyAdminTier(id),
    fallbackError: 'Could not verify the product',
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.tiers })
    },
  })
}

export function useVerifyAllAdminTiers() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => verifyAllAdminTiers(),
    fallbackError: 'Could not verify the catalogue',
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.tiers })
    },
  })
}
