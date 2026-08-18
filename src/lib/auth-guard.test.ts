import { describe, expect, it } from 'vitest'
import { resolveAuthGuardHref } from '@/lib/auth-guard'
import type { SessionInfo } from '@/lib/instance-api'

const session: SessionInfo = {
  userId: 'user-1',
  email: 'admin@example.com',
  role: 'superadmin',
}

describe('resolveAuthGuardHref', () => {
  it('keeps recovering reachable without a session', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: false,
        topSegment: 'recovering',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('sends unsigned hosts to install when setup is required', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: true,
        topSegment: 'sign-in',
        developerDevBypass: false,
      }),
    ).toBe('/install')
  })

  it('allows the install wizard while setup is required', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: true,
        topSegment: 'install',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('leaves install after setup completes with a session', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'install',
        developerDevBypass: false,
      }),
    ).toBe('/welcome')
  })

  it('leaves install after setup completes without a session', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: false,
        topSegment: 'install',
        developerDevBypass: false,
      }),
    ).toBe('/sign-in')
  })

  it('does not bounce signed-in users off welcome when that is the dashboard', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'welcome',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('allows the organization switcher', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'organizations',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('allows signed-in org routes', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: '11111111-1111-1111-1111-111111111111',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('sends signed-in guests on auth routes to the dashboard', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'sign-in',
        developerDevBypass: false,
      }),
    ).toBe('/welcome')
  })

  it('sends Metro web and native-without-origin to connect', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: false,
        topSegment: 'sign-in',
        developerDevBypass: false,
        needsControlPlane: true,
      }),
    ).toBe('/connect')
  })

  it('keeps native clients on connect even when already signed in', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'connect',
        developerDevBypass: false,
        allowConnect: true,
      }),
    ).toBeNull()
  })

  it('blocks the PAM install wizard on native', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: true,
        topSegment: 'sign-in',
        developerDevBypass: false,
        blockNativeInstall: true,
      }),
    ).toBe('/connect')
  })

  it('sends same-origin web away from connect', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: false,
        topSegment: 'connect',
        developerDevBypass: false,
      }),
    ).toBe('/sign-in')
  })

  it('allows admin routes for admin sessions', () => {
    expect(
      resolveAuthGuardHref({
        session: { ...session, role: 'admin' },
        needsInstall: false,
        topSegment: 'admin',
        developerDevBypass: false,
      }),
    ).toBeNull()
  })

  it('redirects signed-in users away from developer without bypass', () => {
    expect(
      resolveAuthGuardHref({
        session,
        needsInstall: false,
        topSegment: 'developer',
        developerDevBypass: false,
      }),
    ).toBe('/welcome')
  })

  it('honors developer bypass on unsigned routes', () => {
    expect(
      resolveAuthGuardHref({
        session: null,
        needsInstall: false,
        topSegment: 'developer',
        developerDevBypass: true,
      }),
    ).toBeNull()
  })
})
