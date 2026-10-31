import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyOrgFabric,
  deleteOrgFabric,
  fetchOrgFabric,
  isHttpStatusError,
  patchOrgFabricRelay,
  patchOrgFabricServer,
  saveOrgFabric,
  type OrgFabricSettings,
  type PatchOrgFabricRelayBody,
  type PatchOrgFabricServerBody,
} from '@/lib/instance-api'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useApiMutation, queryKeys } from '@/lib/query-client'

function isFabricUnavailableError(error: unknown): boolean {
  return isHttpStatusError(error, 404) || isHttpStatusError(error, 503)
}

/** How often to read the mesh again while a server has not answered its last request. */
export const FABRIC_PENDING_POLL_MS = 3000

/** A request nobody answered for this long is left alone: the server is offline, not working on it. */
export const FABRIC_PENDING_GIVE_UP_MS = 5 * 60_000

/**
 * Read the mesh again soon while any server still owes an answer to the last
 * apply, pause or resume, so a notice such as "0 of 5 servers have taken their
 * tunnel down" follows the servers instead of waiting for a reload. It stops
 * for a request older than {@link FABRIC_PENDING_GIVE_UP_MS} (an offline server
 * never answers) and while the last read failed (the data is old).
 */
export function fabricPollInterval(
  query: Readonly<{ state: Readonly<{ data: OrgFabricSettings | undefined; status: string }> }>,
  nowMs: number = Date.now()
): number | false {
  if (query.state.status === 'error') return false
  const waiting = (query.state.data?.relays ?? []).some((relay) => {
    const reconcile = relay.reconcile
    if (reconcile?.state !== 'pending') return false
    const asked = Date.parse(reconcile.at)
    return Number.isNaN(asked) || nowMs - asked <= FABRIC_PENDING_GIVE_UP_MS
  })
  return waiting ? FABRIC_PENDING_POLL_MS : false
}

export function useOrgFabric(
  orgId: string,
  options?: Readonly<{ enabled?: boolean; /** Read it again on every mount. */ fresh?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.fabric,
    queryFn: () => fetchOrgFabric(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: (query) => fabricPollInterval(query),
    ...(options?.fresh ? { staleTime: 0 } : {}),
    retry: (failureCount, error) => {
      if (isFabricUnavailableError(error)) return false
      return failureCount < 2
    },
  })
}

export function isOrgFabricUnavailable(error: unknown): boolean {
  return isFabricUnavailableError(error)
}

function useFabricSettingsWriter(orgId: string) {
  const queryClient = useQueryClient()
  return async (data: OrgFabricSettings) => {
    queryClient.setQueryData(queryKeys.org(orgId).settings.fabric, data)
    await queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).settings.fabric,
    })
  }
}

export function useSaveOrgFabric(orgId: string) {
  const writeSettings = useFabricSettingsWriter(orgId)
  return useApiMutation({
    mutationFn: (input: { enabled: boolean; allowRelay?: boolean }) => {
      if (input.allowRelay === undefined) {
        return saveOrgFabric(orgId, input.enabled)
      }
      return saveOrgFabric(orgId, input.enabled, {
        allowRelay: input.allowRelay,
      })
    },
    onSuccess: writeSettings,
    fallbackError: `Failed to update ${TURBOFABRIC_PRODUCT_NAME}`,
  })
}

/** Removes TurboFabric completely (keys and cross-server container networks deleted). */
export function useRemoveOrgFabric(orgId: string) {
  const writeSettings = useFabricSettingsWriter(orgId)
  return useApiMutation({
    mutationFn: () => deleteOrgFabric(orgId),
    onSuccess: writeSettings,
    fallbackError: `Failed to remove ${TURBOFABRIC_PRODUCT_NAME}`,
  })
}

/** One server's TurboFabric switch and role. */
export function usePatchOrgFabricServer(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: PatchOrgFabricServerBody) => patchOrgFabricServer(orgId, serverId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).settings.fabric,
      }),
    fallbackError: `Failed to update this server's ${TURBOFABRIC_PRODUCT_NAME} settings`,
  })
}

export function usePatchOrgFabricRelay(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: PatchOrgFabricRelayBody) => patchOrgFabricRelay(orgId, serverId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).settings.fabric,
      }),
    fallbackError: `Failed to update ${TURBOFABRIC_PRODUCT_NAME} relay`,
  })
}

export function useApplyOrgFabric(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => applyOrgFabric(orgId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).settings.fabric,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
    fallbackError: `Failed to apply ${TURBOFABRIC_PRODUCT_NAME}`,
  })
}
