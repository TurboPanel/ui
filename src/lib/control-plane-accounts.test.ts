import { afterEach, describe, expect, it } from 'vitest'
import {
  HA_CONTROL_PLANE_ORIGIN,
  LOCAL_HTTPS_ORIGIN,
  setControlPlaneEnvReader,
} from '@/lib/control-plane'
import {
  activateControlPlaneOrigin,
  canQueryControlPlane,
  getActiveControlPlaneAccount,
  getActiveControlPlaneOrigin,
  rememberSignedInAccount,
  removeActiveControlPlaneAccount,
  resetControlPlaneStoreForTests,
  switchControlPlaneAccount,
} from '@/lib/control-plane-accounts'

afterEach(() => {
  resetControlPlaneStoreForTests()
  setControlPlaneEnvReader(() => ({
    platformOS: 'web',
    isDev: true,
    locationOrigin: null,
  }))
})

describe('control-plane account store', () => {
  it('activates a new origin and remembers sign-in metadata', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({
      email: 'ops@example.com',
      runtime: 'deno',
    })
    expect(getActiveControlPlaneAccount()).toEqual({
      origin: LOCAL_HTTPS_ORIGIN,
      kind: 'self-hosted',
      email: 'ops@example.com',
      runtime: 'deno',
      lastOrgId: null,
    })
  })

  it('switches between saved origins without dropping the other', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({ email: 'local@example.com' })
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    rememberSignedInAccount({ email: 'ha@example.com', runtime: 'workers' })
    expect(getActiveControlPlaneOrigin()).toBe(HA_CONTROL_PLANE_ORIGIN)
    expect(switchControlPlaneAccount(LOCAL_HTTPS_ORIGIN)).toBe(true)
    expect(getActiveControlPlaneAccount()?.email).toBe('local@example.com')
    expect(getActiveControlPlaneAccount()?.origin).toBe(LOCAL_HTTPS_ORIGIN)
  })

  it('removes the active origin and falls back to the last remaining', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({ email: 'local@example.com' })
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    rememberSignedInAccount({ email: 'ha@example.com' })
    const next = removeActiveControlPlaneAccount()
    expect(next?.origin).toBe(LOCAL_HTTPS_ORIGIN)
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    expect(removeActiveControlPlaneAccount()).toBeNull()
    expect(getActiveControlPlaneOrigin()).toBeNull()
  })

  it('updates lastOrgId without clearing email', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({ email: 'ops@example.com' })
    rememberSignedInAccount({ lastOrgId: 'org-1' })
    expect(getActiveControlPlaneAccount()?.email).toBe('ops@example.com')
    expect(getActiveControlPlaneAccount()?.lastOrgId).toBe('org-1')
  })

  it('does not query on Metro web or native without an origin', () => {
    setControlPlaneEnvReader(() => ({
      platformOS: 'web',
      isDev: true,
      locationOrigin: 'http://localhost:8081',
    }))
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(canQueryControlPlane()).toBe(false)

    resetControlPlaneStoreForTests()
    setControlPlaneEnvReader(() => ({
      platformOS: 'ios',
      isDev: true,
      locationOrigin: null,
    }))
    expect(canQueryControlPlane()).toBe(false)
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(canQueryControlPlane()).toBe(true)
  })
})
