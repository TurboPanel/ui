import { useAuth } from '@/lib/auth-context'
import { useUnreadNotificationsQuery } from '@/lib/queries/notifications'

/**
 * Unread count for the native avatar badge and the web bell badge.
 *
 * Polls `GET /notifications/unread-count` every three minutes while signed in and the tab is visible; 0
 * while signed out, loading, or when the control plane cannot answer — a
 * badge must never be the thing that breaks the header.
 */
export function useUnreadNotificationCount(): number {
  const { session } = useAuth()
  const query = useUnreadNotificationsQuery({ enabled: Boolean(session) })
  return query.data ?? 0
}
