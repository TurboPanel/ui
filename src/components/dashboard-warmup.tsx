import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { fetchOrganizations } from '@/lib/instance-api'
import {
  DASHBOARD_CACHE_STORAGE_KEY,
  clearDashboardCache,
  isPersistableQueryKey,
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
    let stopped = false
    // Only a successful update of a kept list changes the snapshot.
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (stopped || event.type !== 'updated' || event.action.type !== 'success') return
      if (!isPersistableQueryKey(event.query.queryKey)) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveDashboardCache(queryClient, userId)
      }, SAVE_DELAY_MS)
    })
    // The snapshot was removed in another tab (sign-out there): drop what this
    // tab holds of it and stop writing it back.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_CACHE_STORAGE_KEY || event.newValue !== null) return
      stopped = true
      if (timer) clearTimeout(timer)
      queryClient.removeQueries({ predicate: (query) => isPersistableQueryKey(query.queryKey) })
    }
    const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
    if (canListen) window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
      if (canListen) window.removeEventListener('storage', onStorage)
    }
  }, [queryClient, hasSession, userId, isLoading])

  return null
}
