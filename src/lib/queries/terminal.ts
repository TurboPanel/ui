import { useQueryClient } from '@tanstack/react-query'
import { setServerTerminal } from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Turn the server's container terminal switch on or off. Turning it off ends
 * the open terminals on the control plane; the server record is refetched so
 * every screen that shows the entry follows.
 */
export function useSetServerTerminal(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (container: boolean) => setServerTerminal(serverId, container),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).servers.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).servers.detail(serverId) }),
      ])
    },
  })
}
