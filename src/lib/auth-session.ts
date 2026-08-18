import type { SessionInfo } from '@/lib/instance-api'

export function isSuperadminSession(session: SessionInfo | null): boolean {
  return session !== null && session.role === 'superadmin'
}

export function isAdminSession(session: SessionInfo | null): boolean {
  return (
    session !== null &&
    (session.role === 'superadmin' || session.role === 'admin')
  )
}

export function hasUserSession(session: SessionInfo | null): boolean {
  return session !== null
}

export function dashboardHref(
  session: SessionInfo | null,
  needsInstall: boolean,
): '/install' | '/sign-in' | '/welcome' | '/organizations' | `/${string}/overview` | '/' {
  if (needsInstall) {
    return '/install'
  }
  if (hasUserSession(session)) {
    return '/welcome'
  }
  return '/sign-in'
}
