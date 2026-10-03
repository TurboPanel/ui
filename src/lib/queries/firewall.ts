import {
  createFirewallRule,
  deleteFirewallRule,
  fetchFirewallPolicy,
  fetchFirewallRules,
  fetchFirewallServer,
  saveFirewallPolicy,
  saveFirewallServerMode,
  updateFirewallRule,
  type FirewallMode,
  type FirewallPolicyUpdate,
  type FirewallRuleBody,
  type FirewallRuleUpdate,
  type FirewallServerView,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** How often a server's firewall view is re-read while a preview is waiting for the host's answer. */
export const FIREWALL_PREVIEW_POLL_MS = 5_000

/**
 * The organization's firewall policy. Owners and managers only: the API
 * refuses everyone else, so callers pass `enabled` from their role check.
 */
export function useFirewallPolicy(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).firewall.policy,
    queryFn: () => fetchFirewallPolicy(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useSaveFirewallPolicy(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (patch: FirewallPolicyUpdate) => saveFirewallPolicy(orgId, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.org(orgId).firewall.policy, data)
    },
  })
}

/** The rules operators typed, oldest first. Derived rules are not part of this list. */
export function useFirewallRules(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).firewall.rules,
    queryFn: () => fetchFirewallRules(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

function useInvalidateFirewallRules(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).firewall.rules })
}

export function useCreateFirewallRule(orgId: string) {
  const invalidate = useInvalidateFirewallRules(orgId)
  return useApiMutation({
    mutationFn: (body: FirewallRuleBody) => createFirewallRule(orgId, body),
    onSuccess: invalidate,
  })
}

export function useUpdateFirewallRule(orgId: string) {
  const invalidate = useInvalidateFirewallRules(orgId)
  return useApiMutation({
    mutationFn: ({ ruleId, patch }: Readonly<{ ruleId: string; patch: FirewallRuleUpdate }>) =>
      updateFirewallRule(orgId, ruleId, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteFirewallRule(orgId: string) {
  const invalidate = useInvalidateFirewallRules(orgId)
  return useApiMutation({
    mutationFn: (ruleId: string) => deleteFirewallRule(orgId, ruleId),
    onSuccess: invalidate,
  })
}

/** Poll only while a preview is waiting for the host's answer; otherwise do not poll. */
export function firewallPreviewRefetchInterval(
  data: Readonly<FirewallServerView> | undefined
): number | false {
  return data?.preview?.status === 'queued' ? FIREWALL_PREVIEW_POLL_MS : false
}

/**
 * One server's firewall mode and its last preview. The preview is sent by the
 * control plane on its own (after a rule or mode change, and after each
 * reconnect), so while one is `queued` this re-reads on a short timer until
 * the host answers; otherwise it does not poll.
 */
export function useFirewallServer(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).firewall.server(serverId),
    queryFn: () => fetchFirewallServer(orgId, serverId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    refetchInterval: (query) => firewallPreviewRefetchInterval(query.state.data),
  })
}

export function useSetFirewallMode(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (mode: FirewallMode) => saveFirewallServerMode(orgId, serverId, mode),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).firewall.server(serverId) }),
  })
}
