import type { Href } from 'expo-router'
import {
  dashboardHref,
  hasUserSession,
  isAdminSession,
} from '@/lib/auth-session'
import type { SessionInfo } from '@/lib/instance-api'

export type AuthGuardContext = Readonly<{
  session: SessionInfo | null
  needsInstall: boolean
  topSegment: string | undefined
  developerDevBypass: boolean
}>

/** Returns a redirect target, or `null` to stay on the current route. */
export function resolveAuthGuardHref(ctx: AuthGuardContext): Href | null {
  const { needsInstall, topSegment, developerDevBypass } = ctx

  if (topSegment === 'recovering') {
    return null
  }

  if (needsInstall) {
    return resolveNeedsInstallHref(topSegment, developerDevBypass)
  }

  // Install wizard is only for fresh hosts; leave once install is complete.
  if (topSegment === 'install') {
    return dashboardHref(ctx.session, needsInstall) as Href
  }

  return resolveSessionRouteHref(ctx)
}

function resolveNeedsInstallHref(
  topSegment: string | undefined,
  developerDevBypass: boolean,
): Href | null {
  if (developerDevBypass || topSegment === 'install') {
    return null
  }
  return '/install' as Href
}

function resolveSessionRouteHref(ctx: AuthGuardContext): Href | null {
  const { session, needsInstall, topSegment, developerDevBypass } = ctx
  const signedIn = hasUserSession(session)
  const onAuthRoute = isPublicAuthRoute(topSegment)
  const dash = dashboardHref(session, needsInstall) as Href

  if (!signedIn && !onAuthRoute && !developerDevBypass) {
    return '/sign-in' as Href
  }

  if (signedIn && (topSegment === 'sign-in' || topSegment === 'sign-up')) {
    return dash
  }

  if (signedIn && topSegment === 'welcome' && dash !== '/welcome') {
    return dash
  }

  if (signedIn && shouldLeaveUnknownSignedInRoute(ctx)) {
    return dash
  }

  return null
}

function isPublicAuthRoute(topSegment: string | undefined): boolean {
  return (
    topSegment === 'sign-in' ||
    topSegment === 'sign-up' ||
    topSegment === 'verify-email'
  )
}

function shouldLeaveUnknownSignedInRoute(ctx: AuthGuardContext): boolean {
  const { session, topSegment, developerDevBypass } = ctx

  if (topSegment === 'welcome' || isPublicAuthRoute(topSegment)) {
    return false
  }
  if (developerDevBypass) {
    return false
  }
  if (topSegment === 'admin' && isAdminSession(session)) {
    return false
  }
  return !isOrgRoute(topSegment)
}

const PUBLIC_ROUTE_SEGMENTS = new Set([
  'sign-in',
  'sign-up',
  'verify-email',
  'install',
  'welcome',
  'admin',
  'recovering',
  'developer',
])

function isOrgRoute(topSegment: string | undefined): boolean {
  return Boolean(topSegment && !PUBLIC_ROUTE_SEGMENTS.has(topSegment))
}
