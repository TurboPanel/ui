import { useQuery } from '@tanstack/react-query'
import { fetchInstallStatus } from '@/lib/instance-api'

export const authQueryKeys = {
  authStatus: ['auth-status'] as const,
}

export function useAuthStatus() {
  return useQuery({
    queryKey: authQueryKeys.authStatus,
    queryFn: fetchInstallStatus,
  })
}
