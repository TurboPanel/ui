import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyPublicUrls,
  applyReencryptSecrets,
  attachInstanceCertificate,
  fetchInstanceAcmeSettings,
  fetchInstanceCertificates,
  fetchInstanceDaemon,
  fetchInstanceHostnames,
  cancelUpgradeRun,
  checkUpgradeManifests,
  fetchInstanceUpdates,
  fetchUpgradeActiveRun,
  fetchUpgradeRun,
  fetchUpgradeHistory,
  fetchUpgradeServersPage,
  fetchUpgradeSettings,
  requestColocatedDaemonUpdate,
  requestInstanceUpdate,
  retryUpgradeStep,
  runUpgradePreflight,
  saveUpgradeSettings,
  startPlatformUpgradeRun,
  type UpgradeSettings,
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
  fetchForges,
  fetchPublicUrls,
  fetchServerMetricsLiveSettings,
  fetchSignupSettings,
  type ForgeCreate,
  type ForgeUpdate,
  isForbiddenError,
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
import { useApiMutation, queryKeys } from '@/lib/query-client'
import {
  isControlPlaneRestartError,
  waitForControlPlaneRecovery,
} from '@/lib/control-plane-recovery'
import { getActiveOrganizationId } from '@/lib/org-context'
import { isManagedUpgradeApiMissing } from '@/lib/upgrade-api'
import {
  isUpgradeRunActive,
  UPGRADE_RUN_POLL_MS,
  waitForUpgradeRunSettlement,
} from '@/lib/upgrade-run-poll'
import { clearControlPlaneUpgradeWatch, markControlPlaneUpgradeWatch } from '@/lib/upgrade-watch'
import {
  installedIdentity,
  waitForUnitUpdate,
  type UnitUpdateWait,
  type UpdateTargetIdentity,
} from '@/lib/instance-updates'

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
  | { kind: 'reconnected'; hostnames: InstanceHostnameInput[] }
  /** It came back, but holding a different set — the write never landed. */
  | { kind: 'not-saved'; hostnames: InstanceHostnameInput[] }
  /** It never came back inside the wait window. */
  | { kind: 'unreachable' }

function hostnameIdentity(entry: {
  host: string
  source: string
  uploadedCertId?: string | null
}): string {
  return `${entry.host}\0${entry.source}\0${entry.uploadedCertId ?? ''}`
}

function sameHostnameSet(
  saved: readonly InstanceHostnameRecord[],
  expected: readonly InstanceHostnameInput[],
): boolean {
  const left = saved.map(hostnameIdentity).sort((a, b) => a.localeCompare(b))
  const right = expected.map(hostnameIdentity).sort((a, b) => a.localeCompare(b))
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function hostnameInputs(
  records: readonly InstanceHostnameRecord[],
): InstanceHostnameInput[] {
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
  return useApiMutation({
    mutationFn: async ({
      hostnames,
      onReconnecting,
    }: ApplyPublicUrlsVariables = {}): Promise<ApplyPublicUrlsOutcome> => {
      try {
        await requestPublicUrlsApply()
        return { kind: 'applied' }
      } catch (err) {
        if (!isControlPlaneRestartError(err)) throw err
        onReconnecting?.()
        const recovery = await waitForControlPlaneRecovery({
          probe: fetchInstanceHostnames,
        })
        if (recovery.kind === 'unreachable') return { kind: 'unreachable' }
        const saved = hostnameInputs(recovery.value.hostnames)
        if (hostnames && !sameHostnameSet(recovery.value.hostnames, hostnames)) {
          return { kind: 'not-saved', hostnames: saved }
        }
        return { kind: 'reconnected', hostnames: saved }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.publicUrls,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceHostnames,
      })
    },
  })
}

function invalidateHostnameProjection(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.instanceHostnames }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.publicUrls }),
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

function instanceUpdatesPollInterval(
  data: Awaited<ReturnType<typeof fetchInstanceUpdates>> | undefined,
  activeRunStatus: string | undefined,
): number | false {
  if (activeRunStatus && isUpgradeRunActive(activeRunStatus as 'running')) {
    return UPGRADE_RUN_POLL_MS
  }
  if (!data) return false
  const daemonTarget = data.units.daemon.target
  const instanceTarget = data.units.instance.target
  const daemonInstalled = data.units.daemon.installed
  const instanceInstalled = data.units.instance.installed
  const daemonBehind =
    daemonTarget &&
    daemonInstalled &&
    installedIdentity(daemonInstalled) !==
      `${daemonTarget.version ?? ''}:${daemonTarget.commit ?? ''}`
  const instanceBehind =
    instanceTarget &&
    installedIdentity(instanceInstalled) !==
      `${instanceTarget.version ?? ''}:${instanceTarget.commit ?? ''}`
  return daemonBehind || instanceBehind ? UPGRADE_RUN_POLL_MS : false
}

export function useInstanceUpdates(options?: Readonly<{ enabled?: boolean }>) {
  const activeRun = useUpgradeActiveRun({ enabled: options?.enabled ?? true })
  return useQuery({
    queryKey: queryKeys.admin.instanceUpdates,
    queryFn: fetchInstanceUpdates,
    enabled: options?.enabled ?? true,
    refetchInterval: (query) =>
      instanceUpdatesPollInterval(query.state.data, activeRun.data?.run?.status),
  })
}

async function dispatchThenWait(
  request: () => Promise<unknown>,
  read: () => Promise<{ version: string | null; commit: string | null }>,
  target: UpdateTargetIdentity,
  before: string,
): Promise<UnitUpdateWait> {
  try {
    await request()
  } catch (err) {
    if (!isControlPlaneRestartError(err)) throw err
  }
  return await waitForUnitUpdate({ read, target, before })
}

/**
 * Queue a control-plane update, then poll until the new version answers.
 * The POST returns as soon as the daemon is asked; the install restarts the
 * control plane this request is talking through.
 */
export function useUpgradeInstance() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (
      vars: Readonly<{ target: UpdateTargetIdentity; before: string }>,
    ) =>
      dispatchThenWait(
        requestInstanceUpdate,
        async () => (await fetchInstanceUpdates()).units.instance.installed,
        vars.target,
        vars.before,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceUpdates,
      })
    },
  })
}

export type UpgradeStartResult =
  | { kind: 'applied' }
  | { kind: 'partially_failed' }
  | { kind: 'failed' }
  | { kind: 'cancelled' }
  | { kind: 'missing' }
  | { kind: 'unreachable' }

/** Poll the run id returned by start. A missing row is not success. */
async function pollExactUpgradeRun(runId: string): Promise<UpgradeStartResult> {
  markControlPlaneUpgradeWatch()
  const outcome = await waitForUpgradeRunSettlement({
    readRun: async () => {
      const body = await fetchUpgradeRun(runId)
      return body.run
    },
  })
  clearControlPlaneUpgradeWatch()
  if (outcome.kind === 'missing') return { kind: 'missing' }
  if (outcome.kind === 'completed') {
    if (outcome.status === 'succeeded') return { kind: 'applied' }
    if (outcome.status === 'partially_failed') return { kind: 'partially_failed' }
    if (outcome.status === 'failed') return { kind: 'failed' }
    if (outcome.status === 'cancelled') return { kind: 'cancelled' }
  }
  return { kind: 'unreachable' }
}

export function useRunUpgradePreflight() {
  return useApiMutation({
    mutationFn: () => runUpgradePreflight(),
  })
}

export function useStartPlatformUpgrade() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (runId?: string) => {
      const started = await startPlatformUpgradeRun(runId)
      return await pollExactUpgradeRun(started.runId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.instanceUpdates })
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.upgradeActiveRun })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instance-updates'] })
    },
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

export function useUpgradeHistory(
  page: Readonly<{ offset: number; limit: number }>,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.admin.upgradeHistory(page.offset, page.limit),
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

export function useUpgradeServersPage(
  page: Readonly<{ offset: number; limit: number; status: string }>,
  options?: Readonly<{ enabled?: boolean }>,
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

export function useRetryUpgradeStep() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (stepId: string) => retryUpgradeStep(stepId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.upgradeActiveRun })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'instance-updates'] })
    },
  })
}

export function useCancelUpgradeRun() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (runId: string) => cancelUpgradeRun(runId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.upgradeActiveRun })
    },
  })
}

export function useCheckUpgradeManifests() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => checkUpgradeManifests(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.instanceUpdates })
    },
  })
}

export function useUpgradeColocatedDaemon() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (
      vars: Readonly<{ target: UpdateTargetIdentity; before: string }>,
    ) =>
      dispatchThenWait(
        requestColocatedDaemonUpdate,
        async () => {
          const installed = (await fetchInstanceUpdates()).units.daemon.installed
          return installed ?? { version: null, commit: null }
        },
        vars.target,
        vars.before,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.instanceUpdates,
      })
    },
  })
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
    mutationFn: (body?: Parameters<typeof applyReencryptSecrets>[0]) =>
      applyReencryptSecrets(body),
  })
}

export function useServerMetricsLiveSettings(
  options?: Readonly<{ enabled?: boolean }>,
) {
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
