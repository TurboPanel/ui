import type { SessionInfo } from '@/lib/instance-api'
import { isAdminSession } from '@/lib/auth-session'

/** Admin run status is an admin route. Other sessions must not call it. */
export function upgradeStatusQueryEnabled(input: {
  session: SessionInfo | null
  canQuery: boolean
}): boolean {
  return input.canQuery && isAdminSession(input.session)
}
