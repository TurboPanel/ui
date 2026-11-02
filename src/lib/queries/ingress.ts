import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ingressStatusInterval } from '@/lib/connection-modes'
import {
  addIngressAccount,
  applyHostnameIngress,
  fetchHostnameIngressStatus,
  fetchIngressAccounts,
  fetchIngressCapabilities,
  fetchInstanceTunnelStatus,
  fetchPanelDnsCertificate,
  type HostnameIngressPatch,
  type IngressStatus,
  type InstanceHostnameRecord,
  orderPanelDnsCertificate,
  preflightHostnameIngress,
  recheckIngressAccount,
  refreshInstanceTunnelStatus,
  removeHostnameIngress,
  removeIngressAccount,
  setEdgeGate,
  updateHostnameIngress,
} from '@/lib/instance-api'
import { panelDnsInterval } from '@/lib/panel-certificate-causes'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Connection modes, the Cloudflare account and DNS-01 for the control plane's
 * own hostnames. Every read is self-hosted only: callers pass
 * `enabled: controlPlaneRuntime !== 'workers'`, because High Availability
 * answers 404 on these paths.
 */
type Enabled = Readonly<{ enabled?: boolean }>

export function useIngressCapabilities(options?: Enabled) {
  return useQuery({
    queryKey: queryKeys.admin.ingressCapabilities,
    queryFn: fetchIngressCapabilities,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  })
}

export function useIngressAccounts(options?: Enabled) {
  return useQuery({
    queryKey: queryKeys.admin.ingressAccounts,
    queryFn: fetchIngressAccounts,
    enabled: options?.enabled ?? true,
  })
}

export const TUNNEL_STATUS_POLL_MS = 60_000

/** The tunnel Status panel: read every minute. */
export function useInstanceTunnelStatus(options?: Enabled) {
  return useQuery({
    queryKey: queryKeys.admin.instanceTunnel,
    queryFn: fetchInstanceTunnelStatus,
    enabled: options?.enabled ?? true,
    refetchInterval: TUNNEL_STATUS_POLL_MS,
  })
}

/** Refresh asks the daemon again and writes the answer straight into the panel. */
export function useRefreshInstanceTunnelStatus() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: refreshInstanceTunnelStatus,
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKeys.admin.instanceTunnel, fresh)
    },
  })
}

/** Live read: every 15 seconds while applying or degraded, else every minute. */
export function useHostnameIngressStatus(id: string | null, options?: Enabled) {
  return useQuery({
    queryKey: queryKeys.admin.hostnameIngressStatus(id ?? ''),
    queryFn: () => fetchHostnameIngressStatus(id ?? ''),
    enabled: (options?.enabled ?? true) && id !== null,
    refetchInterval: (query) => ingressStatusInterval(query.state.data),
  })
}

/** The same live reads for several names at once (shares the cache with the single hook). */
export function useHostnameIngressStatuses(ids: readonly string[], options?: Enabled) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.admin.hostnameIngressStatus(id),
      queryFn: () => fetchHostnameIngressStatus(id),
      enabled: options?.enabled ?? true,
      refetchInterval: (query: { state: { data?: IngressStatus } }) =>
        ingressStatusInterval(query.state.data),
    })),
  })
}

/** Every 10 seconds while the order waits on DNS or validation, else no interval. */
export function usePanelDnsCertificate(id: string | null, options?: Enabled) {
  return useQuery({
    queryKey: queryKeys.admin.panelDnsCertificate(id ?? ''),
    queryFn: () => fetchPanelDnsCertificate(id ?? ''),
    enabled: (options?.enabled ?? true) && id !== null,
    refetchInterval: (query) => panelDnsInterval(query.state.data),
  })
}

export function useSetEdgeGate() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: setEdgeGate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.ingressCapabilities })
    },
  })
}

function replaceHostname(queryClient: QueryClient, hostname: InstanceHostnameRecord) {
  queryClient.setQueryData<{ hostnames: InstanceHostnameRecord[] }>(
    queryKeys.admin.instanceHostnames,
    (current) =>
      current && {
        ...current,
        hostnames: current.hostnames.map((row) => (row.id === hostname.id ? hostname : row)),
      }
  )
}

/** Writes the one changed row into the hostname list; nothing else is refetched. */
export function useUpdateHostnameIngress() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { id: string; patch: HostnameIngressPatch }) =>
      updateHostnameIngress(input.id, input.patch),
    onSuccess: (result) => {
      if (result.ok) replaceHostname(queryClient, result.hostname)
    },
  })
}

export function usePreflightHostnameIngress() {
  return useApiMutation({ mutationFn: preflightHostnameIngress })
}

async function refreshStatus(queryClient: QueryClient, id: string) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.admin.hostnameIngressStatus(id) })
}

export function useApplyHostnameIngress() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { id: string; replaceExisting?: boolean }) =>
      applyHostnameIngress(input.id, { replaceExisting: input.replaceExisting }),
    onSettled: async (_data, _error, input) => refreshStatus(queryClient, input.id),
  })
}

export function useRemoveHostnameIngress() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: removeHostnameIngress,
    onSettled: async (_data, _error, id) => refreshStatus(queryClient, id),
  })
}

function useAccountMutation<TData, TVariables>(mutationFn: (input: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.ingressAccounts })
    },
  })
}

export function useAddIngressAccount() {
  return useAccountMutation(addIngressAccount)
}

export function useRecheckIngressAccount() {
  return useAccountMutation(recheckIngressAccount)
}

export function useRemoveIngressAccount() {
  return useAccountMutation(removeIngressAccount)
}

export function useOrderPanelDnsCertificate() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { id: string; retry: boolean }) =>
      orderPanelDnsCertificate(input.id, input.retry),
    onSettled: async (_data, _error, input) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.panelDnsCertificate(input.id),
      })
    },
  })
}
