import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchHosting,
  fetchHostingDnsCheck,
  requestLetsEncryptForHosting,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { certificatePollInterval } from '@/lib/hosting-certificate'
import { ORIGIN_WAITING_POLL_MS, waitsForOriginCertificate } from '@/lib/name-certificates'

/** One hosting with its derived certificate block. */
export function useHostingCertificate(
  orgId: string,
  hostingId: string | null,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).hostings.detail(hostingId ?? ''),
    queryFn: () => fetchHosting(hostingId ?? ''),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && hostingId !== null,
    // Follows a certificate the server is still issuing, without a reload.
    refetchInterval: (query) => {
      const hosting = query.state.data?.hosting
      return (
        certificatePollInterval(hosting?.certificate) ||
        (waitsForOriginCertificate(hosting?.names) && ORIGIN_WAITING_POLL_MS)
      )
    },
  })
}

/** "Use Let's Encrypt" and "Try again": the same idempotent PUT. */
export function useUseLetsEncrypt(orgId: string, hostingId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => requestLetsEncryptForHosting(hostingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).hostings.all })
    },
  })
}

/** "Check DNS": read-only, never changes the hosting. */
export function useHostingDnsCheck(hostingId: string) {
  return useApiMutation({ mutationFn: () => fetchHostingDnsCheck(hostingId) })
}
