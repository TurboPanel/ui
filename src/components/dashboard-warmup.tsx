import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { fetchOrganizations } from '@/lib/instance-api'
import {
  clearDashboardCache,
  restoreDashboardCache,
  saveDashboardCache,
} from '@/lib/dashboard-cache'
import { queryKeys } from '@/lib/query-keys'

const SAVE_DELAY_MS = 1500

/**
 * Starts the organization list as soon as the session is known (the
 * organization route no longer has to mount first), puts the last dashboard
 * lists back for the same person, and keeps them saved. It renders nothing.
 */
export function DashboardWarmup() {
  const queryClient = useQueryClient()
  const { session, isLoading } = useAuth()
  const hasSession = Boolean(session)
  const userId = session?.userId ?? null
  const restoredFor = useRef<string | null>(null)

  useEffect(() => {
    if (!hasSession) {
      restoredFor.current = null
      // Signed out, or the session ended: nothing saved may outlive the person.
      if (!isLoading) clearDashboardCache()
      return
    }
    if (userId && restoredFor.current !== userId) {
      restoredFor.current = userId
      restoreDashboardCache(queryClient, userId)
    }
    void queryClient
      .prefetchQuery({ queryKey: queryKeys.auth.organizations, queryFn: fetchOrganizations })
      .catch(() => undefined)
    if (!userId) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveDashboardCache(queryClient, userId)
      }, SAVE_DELAY_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [queryClient, hasSession, userId, isLoading])

  return null
}
