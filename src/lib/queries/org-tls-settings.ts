import { useQuery } from '@tanstack/react-query'
import { fetchOrgTlsSettings } from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-client'

/**
 * The organization's "Allow Let's Encrypt certificates" switch: true or false
 * once read, null while it loads or when it cannot be read (a role that may
 * not manage the organization), so a caller can tell "off" from "unknown".
 */
export function useOrgAllowsLetsEncrypt(orgId: string): boolean | null {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.tlsSettings,
    queryFn: () => fetchOrgTlsSettings(orgId),
    enabled: orgId.length > 0,
  })
  return query.data?.acmeEnabled ?? null
}
