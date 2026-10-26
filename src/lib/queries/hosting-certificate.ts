import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchHosting,
  fetchHostingDnsCheck,
  requestLetsEncryptForHosting,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { certificatePollInterval } from '@/lib/hosting-certificate'

/** One hosting with its derived certificate block. */
export function useHostingCertificate(
  orgId: string,
  hostingId: string | null,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).hostings.detail(hostingId ?? ''),
    queryFn: () => fetchHosting(hostingId ?? ''),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && hostingId !== null,
    // Follows a certificate the server is still issuing, without a reload.
    refetchInterval: (query) => certificatePollInterval(query.state.data?.hosting.certificate),
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

/** The same request for a hosting that was only just saved, so its id is known at call time. */
export function useRequestLetsEncrypt(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (hostingId: string) => requestLetsEncryptForHosting(hostingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).hostings.all })
    },
    fallbackError: 'Could not start Let’s Encrypt.',
  })
}

/** "Check DNS": read-only, never changes the hosting. */
export function useHostingDnsCheck(hostingId: string) {
  return useApiMutation({ mutationFn: () => fetchHostingDnsCheck(hostingId) })
}
