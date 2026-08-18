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
  /** Metro web, or native with no origin — send to /connect. */
  needsControlPlane?: boolean
  /** Native must not open the host PAM install wizard. */
  blockNativeInstall?: boolean
  /** Metro web and native may remain on /connect (including add-another). */
  allowConnect?: boolean
}>

/** Returns a redirect target, or `null` to stay on the current route. */
export function resolveAuthGuardHref(ctx: AuthGuardContext): Href | null {
  const { needsInstall, topSegment, developerDevBypass } = ctx

  if (topSegment === 'recovering') {
    return null
  }

  if (topSegment === 'connect') {
    return resolveConnectHref(ctx)
  }

  if (ctx.needsControlPlane) {
    return '/connect' as Href
  }

  if (needsInstall && ctx.blockNativeInstall) {
    return '/connect' as Href
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

function resolveConnectHref(ctx: AuthGuardContext): Href | null {
  if (ctx.allowConnect || ctx.needsControlPlane || ctx.blockNativeInstall) {
    return null
  }
  // Same-origin web should never sit on /connect.
  return dashboardHref(ctx.session, ctx.needsInstall) as Href
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

  if (topSegment === 'welcome' || topSegment === 'organizations' || isPublicAuthRoute(topSegment)) {
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
  'organizations',
  'admin',
  'recovering',
  'developer',
  'connect',
])

function isOrgRoute(topSegment: string | undefined): boolean {
  return Boolean(topSegment && !PUBLIC_ROUTE_SEGMENTS.has(topSegment))
}
