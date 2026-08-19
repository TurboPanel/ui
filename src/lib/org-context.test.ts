import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isRemoteCookieClient } from '@/lib/control-plane'
import { rememberSignedInAccount } from '@/lib/control-plane-accounts'
import {
  ORG_ID_HEADER,
  clearStoredOrganizationId,
  getActiveOrganizationId,
  getStoredOrganizationId,
  resolvePreferredOrganizationId,
  setActiveOrganizationId,
  setStoredOrganizationId,
} from '@/lib/org-context'

vi.mock('@/lib/control-plane', () => ({
  isRemoteCookieClient: vi.fn(() => false),
}))

vi.mock('@/lib/control-plane-accounts', () => ({
  rememberSignedInAccount: vi.fn(),
}))

function createLocalStorage() {
  const memory = new Map<string, string>()
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
    clear: () => {
      memory.clear()
    },
  }
}

describe('org-context', () => {
  let localStorageMock: ReturnType<typeof createLocalStorage>

  beforeEach(() => {
    localStorageMock = createLocalStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })
    vi.mocked(isRemoteCookieClient).mockReturnValue(false)
    vi.mocked(rememberSignedInAccount).mockReset()
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    setActiveOrganizationId(null)
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('exports the org id header constant', () => {
    expect(ORG_ID_HEADER).toBe('X-Turbopanel-Organization-Id')
  })

  describe('stored organization id', () => {
    it('round-trips through localStorage', () => {
      expect(getStoredOrganizationId()).toBeNull()
      setStoredOrganizationId('org-1')
      expect(getStoredOrganizationId()).toBe('org-1')
      clearStoredOrganizationId()
      expect(getStoredOrganizationId()).toBeNull()
    })

    it('ignores blank stored values', () => {
      localStorageMock.setItem('turbopanel.lastOrganizationId', '   ')
      expect(getStoredOrganizationId()).toBeNull()
    })

    it('no-ops when localStorage is missing', () => {
      Reflect.deleteProperty(globalThis, 'localStorage')
      expect(getStoredOrganizationId()).toBeNull()
      expect(() => setStoredOrganizationId('org-1')).not.toThrow()
      expect(() => clearStoredOrganizationId()).not.toThrow()
    })
  })

  describe('active organization id', () => {
    it('persists active org and clears storage when cleared', () => {
      setActiveOrganizationId('org-active')
      expect(getActiveOrganizationId()).toBe('org-active')
      expect(getStoredOrganizationId()).toBe('org-active')

      setActiveOrganizationId(null)
      expect(getActiveOrganizationId()).toBeNull()
      expect(getStoredOrganizationId()).toBeNull()
    })

    it('remembers last org on native remote cookie clients', () => {
      vi.mocked(isRemoteCookieClient).mockReturnValue(true)
      setActiveOrganizationId('org-native')
      expect(rememberSignedInAccount).toHaveBeenCalledWith({ lastOrgId: 'org-native' })
    })
  })

  describe('resolvePreferredOrganizationId', () => {
    it('returns null for an empty list', () => {
      expect(resolvePreferredOrganizationId([])).toBeNull()
    })

    it('returns the sole organization when only one exists', () => {
      expect(resolvePreferredOrganizationId([{ id: 'org-only' }])).toBe('org-only')
    })

    it('prefers a stored id when it is still valid', () => {
      setStoredOrganizationId('org-b')
      const orgs = [{ id: 'org-a' }, { id: 'org-b' }]
      expect(resolvePreferredOrganizationId(orgs)).toBe('org-b')
    })

    it('returns null when stored id is stale and multiple orgs exist', () => {
      setStoredOrganizationId('org-missing')
      const orgs = [{ id: 'org-a' }, { id: 'org-b' }]
      expect(resolvePreferredOrganizationId(orgs)).toBeNull()
    })
  })
})
