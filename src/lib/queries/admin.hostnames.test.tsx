// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import {
  useAttachInstanceCertificate,
  useInstanceAcmeSettings,
  useInstanceCertificates,
  useInstanceDaemon,
  useInstanceHostnames,
  instanceUpdatesPollInterval,
  useInstanceUpdates,
  useLetsEncryptTermsGuard,
  usePlatformCa,
  useReconcilePlatformCaTrust,
  useSaveInstanceAcmeSettings,
  useSaveInstanceHostnames,
  useSetInstanceTunnelToken,
  useTrustedProxies,
  useUploadInstanceCertificate,
} from './admin'

const api = vi.hoisted(() => ({
  fetchInstanceHostnames: vi.fn(),
  saveInstanceHostnames: vi.fn(),
  fetchInstanceCertificates: vi.fn(),
  uploadInstanceCertificate: vi.fn(),
  attachInstanceCertificate: vi.fn(),
  fetchInstanceAcmeSettings: vi.fn(),
  saveInstanceAcmeSettings: vi.fn(),
  fetchInstanceUpdates: vi.fn(),
  fetchUpgradeActiveRun: vi.fn(),
  fetchInstanceDaemon: vi.fn(),
  fetchPlatformCa: vi.fn(),
  reconcilePlatformCaTrust: vi.fn(),
  fetchTrustedProxies: vi.fn(),
  setInstanceTunnelToken: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return { ...actual, ...api }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const installed = { version: '0.1.1', commit: 'abc' }

function updatesPayload(daemonInstalled: typeof installed | null) {
  return {
    ok: true,
    channel: 'canary',
    units: {
      instance: { installed, target: null, uiTarget: null },
      daemon: {
        installed: daemonInstalled,
        target: null,
        serverId: 'srv-1',
        connected: true,
      },
    },
  }
}

describe('instance hostname and update queries', () => {
  it('loads hostnames, certificates, ACME, the daemon, and proxies', async () => {
    api.fetchInstanceHostnames.mockResolvedValue({ ok: true, hostnames: [] })
    api.fetchInstanceCertificates.mockResolvedValue({ ok: true, certificates: [] })
    api.fetchInstanceAcmeSettings.mockResolvedValue({ settings: { contactEmail: '' } })
    api.fetchInstanceDaemon.mockResolvedValue({ connected: true })
    api.fetchInstanceUpdates.mockResolvedValue(updatesPayload(installed))
    api.fetchUpgradeActiveRun.mockResolvedValue({ ok: true, run: null })
    api.fetchPlatformCa.mockResolvedValue({ fingerprint: 'aa' })
    api.fetchTrustedProxies.mockResolvedValue({ proxies: [] })

    const wrapper = createWrapper()
    const hostnames = renderHook(() => useInstanceHostnames(), { wrapper })
    const certificates = renderHook(() => useInstanceCertificates(), { wrapper })
    const acme = renderHook(() => useInstanceAcmeSettings({ enabled: false }), { wrapper })
    const daemon = renderHook(() => useInstanceDaemon(), { wrapper })
    const updates = renderHook(() => useInstanceUpdates(), { wrapper })
    const platformCa = renderHook(() => usePlatformCa(), { wrapper })
    const proxies = renderHook(() => useTrustedProxies(), { wrapper })

    expect(acme.result.current.fetchStatus).toBe('idle')
    await waitFor(() => {
      expect(hostnames.result.current.isSuccess).toBe(true)
      expect(certificates.result.current.isSuccess).toBe(true)
      expect(daemon.result.current.isSuccess).toBe(true)
      expect(updates.result.current.isSuccess).toBe(true)
      expect(updates.result.current.data).toEqual(updatesPayload(installed))
      expect(platformCa.result.current.isSuccess).toBe(true)
      expect(proxies.result.current.isSuccess).toBe(true)
    })
  })

  it('a hostname save refreshes every webhook-origins read', async () => {
    const client = createAppQueryClient()
    const keys = [
      [...queryKeys.admin.forges, 'webhook-origins'],
      [...queryKeys.org('org-1').forges, 'webhook-origins'],
    ]
    for (const key of keys) client.setQueryData(key, { origins: [], platformManaged: false })
    api.saveInstanceHostnames.mockResolvedValue({ ok: true, hostnames: [] })
    const save = renderHook(() => useSaveInstanceHostnames(), { wrapper: createWrapper(client) })
    await expect(save.result.current.run([])).resolves.toMatchObject({ ok: true })
    await waitFor(() => {
      for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    })
  })

  it('saves hostnames, certificates, ACME, trust, and the tunnel token', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    api.saveInstanceHostnames.mockResolvedValue({ ok: true, hostnames: [] })
    api.uploadInstanceCertificate.mockResolvedValue({ ok: true, id: 'cert-1' })
    api.attachInstanceCertificate.mockResolvedValue({ ok: true, hostnames: [] })
    api.saveInstanceAcmeSettings.mockResolvedValue({ settings: { contactEmail: 'a@b.c' } })
    api.reconcilePlatformCaTrust.mockResolvedValue({ ok: true, enqueued: 1 })
    api.setInstanceTunnelToken.mockResolvedValue({ ok: true })

    const saveHostnames = renderHook(() => useSaveInstanceHostnames(), { wrapper })
    const upload = renderHook(() => useUploadInstanceCertificate(), { wrapper })
    const attach = renderHook(() => useAttachInstanceCertificate(), { wrapper })
    const saveAcme = renderHook(() => useSaveInstanceAcmeSettings(), { wrapper })
    const reconcile = renderHook(() => useReconcilePlatformCaTrust(), { wrapper })
    const tunnel = renderHook(() => useSetInstanceTunnelToken(), { wrapper })

    await expect(saveHostnames.result.current.run([])).resolves.toMatchObject({ ok: true })
    await expect(
      upload.result.current.run({ label: 'edge', certPem: 'c', keyPem: 'k' })
    ).resolves.toMatchObject({ ok: true })
    await expect(
      attach.result.current.run({ id: 'cert-1', hosts: ['panel.example.com'] })
    ).resolves.toMatchObject({ ok: true })
    await expect(saveAcme.result.current.run({ contactEmail: 'a@b.c' })).resolves.toMatchObject({
      ok: true,
    })
    await expect(reconcile.result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    await expect(tunnel.result.current.run('')).resolves.toMatchObject({ ok: true })

    expect(client.getQueryData(queryKeys.admin.instanceAcme)).toEqual({
      settings: { contactEmail: 'a@b.c' },
    })
  })
})

describe("Let's Encrypt terms guard before a hostnames save", () => {
  const letsEncryptRow = [{ host: 'https://panel.example.com', source: 'lets-encrypt' as const }]
  const platformRow = [{ host: 'https://panel.example.com', source: 'platform-ca' as const }]

  it('refuses while the settings are loading, then follows the server answer', async () => {
    let resolve: (value: unknown) => void = () => {}
    api.fetchInstanceAcmeSettings.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    const guard = renderHook(() => useLetsEncryptTermsGuard(), {
      wrapper: createWrapper(),
    })
    expect(guard.result.current(letsEncryptRow)).toContain('Checking')
    expect(guard.result.current(platformRow)).toBeNull()

    resolve({ settings: {}, tosAccepted: false })
    await waitFor(() => {
      expect(guard.result.current(letsEncryptRow)).toContain('have not been accepted')
    })
  })

  it('allows the save when the server says accepted, even if the raw flag reads otherwise', async () => {
    api.fetchInstanceAcmeSettings.mockResolvedValue({
      settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value: 'yes', source: 'env' } },
      tosAccepted: true,
    })
    const guard = renderHook(() => useLetsEncryptTermsGuard(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => {
      expect(guard.result.current(letsEncryptRow)).toBeNull()
    })
  })

  it('reads an older control plane without tosAccepted by the server flag rule', async () => {
    api.fetchInstanceAcmeSettings.mockResolvedValue({
      settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value: 'yes', source: 'env' } },
    })
    const guard = renderHook(() => useLetsEncryptTermsGuard(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => {
      expect(guard.result.current(letsEncryptRow)).toBeNull()
    })
  })

  it('says the settings could not be read when the request fails', async () => {
    api.fetchInstanceAcmeSettings.mockRejectedValue(new Error('boom'))
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const guard = renderHook(() => useLetsEncryptTermsGuard(), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => {
      expect(guard.result.current(letsEncryptRow)).toContain("Couldn't read")
    })
  })
})

describe('instance updates polling', () => {
  it('polls only while an upgrade run is active, never because an update is available', () => {
    expect(instanceUpdatesPollInterval(undefined)).toBe(false)
    expect(instanceUpdatesPollInterval('succeeded')).toBe(false)
    expect(typeof instanceUpdatesPollInterval('running')).toBe('number')
  })
})
