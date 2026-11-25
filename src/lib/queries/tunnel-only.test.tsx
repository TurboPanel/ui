// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useHostingTunnelOnly, useTunnelOnlyNames } from '@/lib/queries/tunnel-only'

const api = vi.hoisted(() => ({
  resolveResourceId: vi.fn(),
  checkPermission: vi.fn(),
  fetchTunnels: vi.fn(),
  fetchTunnelHostnames: vi.fn(),
  fetchHosting: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const orgId = 'org-1'

function createWrapper() {
  const client = createAppQueryClient()
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function asRole(canManage: boolean) {
  api.resolveResourceId.mockResolvedValue({ resourceId: 'res-1' })
  api.checkPermission.mockResolvedValue({ allowed: canManage })
}

function hostname(name: string, patch: Record<string, unknown> = {}) {
  return {
    id: `h-${name}`,
    tunnelId: 't1',
    hostname: name,
    hostingId: null,
    isLocalOnly: true,
    status: 'live',
    dns: 'none',
    createdAt: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useTunnelOnlyNames', () => {
  it('sends no tunnel or hostname request for someone who cannot manage the org', async () => {
    asRole(false)
    const { result } = renderHook(() => useTunnelOnlyNames(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(api.checkPermission).toHaveBeenCalled())
    await waitFor(() => expect(result.current.size).toBe(0))
    expect(api.fetchTunnels).not.toHaveBeenCalled()
    expect(api.fetchTunnelHostnames).not.toHaveBeenCalled()
  })

  it('maps the locked names of a manager to their tunnel and skips removing ones', async () => {
    asRole(true)
    api.fetchTunnels.mockResolvedValue({ tunnels: [{ id: 't1', name: 'edge' }] })
    api.fetchTunnelHostnames.mockResolvedValue({
      hostnames: [
        hostname('App.Example.com'),
        hostname('public.example.com', { isLocalOnly: false }),
        hostname('gone.example.com', { status: 'removing' }),
      ],
    })
    const { result } = renderHook(() => useTunnelOnlyNames(orgId), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.size).toBe(1))
    expect(api.fetchTunnelHostnames).toHaveBeenCalledWith(orgId, 't1')
    expect(result.current.get('app.example.com')).toBe('edge')
    expect(result.current.has('public.example.com')).toBe(false)
    expect(result.current.has('gone.example.com')).toBe(false)
  })
})

describe('useHostingTunnelOnly', () => {
  it('reports no tunnel for a non-manager with nothing saved', async () => {
    asRole(false)
    const { result } = renderHook(
      () => useHostingTunnelOnly(orgId, null, ['app.example.com'], false),
      { wrapper: createWrapper() }
    )
    await waitFor(() => expect(api.checkPermission).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(api.fetchHosting).not.toHaveBeenCalled()
    expect(api.fetchTunnels).not.toHaveBeenCalled()
  })

  it('lets the hosting’s own tunnel path win, even for a non-manager', async () => {
    asRole(false)
    api.fetchHosting.mockResolvedValue({
      hosting: {
        id: 'host-1',
        tunnels: [
          {
            hostname: 'app.example.com',
            tunnelId: 't9',
            tunnelName: 'own',
            provider: 'cloudflare',
            tunnelOnly: true,
          },
        ],
      },
    })
    const { result } = renderHook(
      () => useHostingTunnelOnly(orgId, 'host-1', ['App.example.com'], true),
      { wrapper: createWrapper() }
    )
    await waitFor(() => expect(result.current).toEqual({ tunnelNames: ['own'] }))
    expect(api.fetchHosting).toHaveBeenCalledWith('host-1')
    expect(api.fetchTunnelHostnames).not.toHaveBeenCalled()
  })

  it('does not read the hosting while its row is closed', async () => {
    asRole(false)
    renderHook(() => useHostingTunnelOnly(orgId, 'host-1', ['app.example.com'], false), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(api.checkPermission).toHaveBeenCalled())
    expect(api.fetchHosting).not.toHaveBeenCalled()
  })
})
