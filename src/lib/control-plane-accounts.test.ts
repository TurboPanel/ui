// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  HA_CONTROL_PLANE_ORIGIN,
  LOCAL_HTTPS_ORIGIN,
  setControlPlaneEnvReader,
} from '@/lib/control-plane'
import {
  activateControlPlaneOrigin,
  canQueryControlPlane,
  configureControlPlaneStorageForTests,
  discardControlPlaneOrigin,
  getActiveControlPlaneAccount,
  getActiveControlPlaneOrigin,
  getControlPlaneAccounts,
  getControlPlaneStoreSnapshot,
  hydrateControlPlaneStore,
  isControlPlaneStoreHydrated,
  rememberSignedInAccount,
  removeActiveControlPlaneAccount,
  resetControlPlaneStoreForTests,
  subscribeControlPlaneStore,
  switchControlPlaneAccount,
  useControlPlaneStore,
} from '@/lib/control-plane-accounts'

afterEach(() => {
  resetControlPlaneStoreForTests()
  configureControlPlaneStorageForTests(null)
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

  it('returns false when switching to an unknown origin', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(switchControlPlaneAccount(HA_CONTROL_PLANE_ORIGIN)).toBe(false)
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
  })

  it('discards a failed origin and restores a prior active account', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    discardControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN, LOCAL_HTTPS_ORIGIN)
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
    expect(getControlPlaneAccounts()).toHaveLength(1)
    expect(getControlPlaneAccounts()[0]?.origin).toBe(LOCAL_HTTPS_ORIGIN)
  })

  it('falls back to the last remaining account when discarding the active origin', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    discardControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    expect(getActiveControlPlaneOrigin()).toBe(LOCAL_HTTPS_ORIGIN)
  })

  it('reuses an existing account when activating the same origin again', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({ email: 'ops@example.com' })
    const first = getActiveControlPlaneAccount()
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    const second = activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(second).toEqual(first)
    expect(getActiveControlPlaneAccount()?.email).toBe('ops@example.com')
    expect(getControlPlaneAccounts()).toHaveLength(2)
    expect(getControlPlaneAccounts().at(-1)?.origin).toBe(LOCAL_HTTPS_ORIGIN)
  })

  it('no-ops rememberSignedInAccount when no origin is active', () => {
    resetControlPlaneStoreForTests()
    rememberSignedInAccount({ email: 'ghost@example.com' })
    expect(getControlPlaneAccounts()).toEqual([])
  })

  it('subscribeControlPlaneStore notifies listeners on state changes', () => {
    resetControlPlaneStoreForTests()
    const listener = vi.fn()
    const unsubscribe = subscribeControlPlaneStore(listener)
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    activateControlPlaneOrigin(HA_CONTROL_PLANE_ORIGIN)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('getControlPlaneStoreSnapshot reflects the current store', () => {
    resetControlPlaneStoreForTests()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    expect(getControlPlaneStoreSnapshot()).toEqual({
      accounts: getControlPlaneAccounts(),
      activeOrigin: LOCAL_HTTPS_ORIGIN,
    })
  })

  it('useControlPlaneStore tracks activate and remember updates', () => {
    resetControlPlaneStoreForTests()
    const { result, rerender } = renderHook(() => useControlPlaneStore())
    expect(result.current.activeOrigin).toBeNull()
    activateControlPlaneOrigin(LOCAL_HTTPS_ORIGIN)
    rememberSignedInAccount({ email: 'ops@example.com' })
    rerender()
    expect(result.current.activeOrigin).toBe(LOCAL_HTTPS_ORIGIN)
    expect(result.current.accounts[0]?.email).toBe('ops@example.com')
  })

  it('hydrateControlPlaneStore restores native accounts from storage', async () => {
    resetControlPlaneStoreForTests({ accounts: [], activeOrigin: null }, { hydrated: false })
    setControlPlaneEnvReader(() => ({
      platformOS: 'ios',
      isDev: true,
      locationOrigin: null,
    }))
    configureControlPlaneStorageForTests({
      read: async () =>
        JSON.stringify({
          accounts: [
            {
              origin: LOCAL_HTTPS_ORIGIN,
              kind: 'self-hosted',
              email: 'native@example.com',
              runtime: 'deno',
              lastOrgId: 'org-1',
            },
          ],
          activeOrigin: LOCAL_HTTPS_ORIGIN,
        }),
      write: async () => {},
    })
    await hydrateControlPlaneStore()
    expect(isControlPlaneStoreHydrated()).toBe(true)
    expect(getActiveControlPlaneAccount()).toEqual({
      origin: LOCAL_HTTPS_ORIGIN,
      kind: 'self-hosted',
      email: 'native@example.com',
      runtime: 'deno',
      lastOrgId: 'org-1',
    })
  })

  it('hydrateControlPlaneStore ignores corrupt storage JSON', async () => {
    resetControlPlaneStoreForTests({ accounts: [], activeOrigin: null }, { hydrated: false })
    setControlPlaneEnvReader(() => ({
      platformOS: 'android',
      isDev: true,
      locationOrigin: null,
    }))
    configureControlPlaneStorageForTests({
      read: async () => '{not-json',
      write: async () => {},
    })
    await hydrateControlPlaneStore()
    expect(getControlPlaneAccounts()).toEqual([])
    expect(isControlPlaneStoreHydrated()).toBe(true)
  })

  it('hydrateControlPlaneStore is a no-op when already hydrated', async () => {
    resetControlPlaneStoreForTests()
    const read = vi.fn(async () => null)
    configureControlPlaneStorageForTests({ read, write: async () => {} })
    setControlPlaneEnvReader(() => ({
      platformOS: 'ios',
      isDev: true,
      locationOrigin: null,
    }))
    await hydrateControlPlaneStore()
    expect(read).not.toHaveBeenCalled()
  })
})
