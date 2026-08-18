/**
 * Notification UI stubs until the instance has a notifications table / API.
 *
 * Unread count drives the native avatar badge and the web bell badge.
 * Always 0 until a real feed is wired.
 */
export function useUnreadNotificationCount(): number {
  return 0
}
