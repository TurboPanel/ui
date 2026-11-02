// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord, InstanceTunnelStatus } from '@/lib/instance-api'
import { TunnelStatusPanel } from './tunnel-status-panel'

const mocks = vi.hoisted(() => ({ status: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/ingress', () => ({
  useInstanceTunnelStatus: mocks.status,
  useRefreshInstanceTunnelStatus: () => ({ run: vi.fn(), isPending: false }),
  useHostnameIngressStatuses: () => [{ data: { phase: 'degraded', detail: 'Self-check failed.' } }],
}))

const TUNNELED = {
  id: 'h1',
  host: 'cp.example.com',
  mode: 'cloudflare-tunnel',
} as InstanceHostnameRecord

afterEach(cleanup)

describe('TunnelStatusPanel', () => {
  it('shows the pasted-token path: connector only, with the edge note and a hostname error', () => {
    const data: InstanceTunnelStatus = {
      ok: true,
      connector: {
        status: 'connected',
        version: '2026.10.0',
        pinnedVersion: null,
        slot: null,
        lastUpdate: null,
        checkedAt: '2026-11-01T10:00:00Z',
      },
      connectorNote: null,
      edge: null,
      edgeNote: 'Connect a Cloudflare account to see edge locations.',
      edgeError: null,
    }
    mocks.status.mockReturnValue({ data, isLoading: false, isError: false })
    render(<TunnelStatusPanel hostnames={[TUNNELED]} />)
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Version 2026.10.0')).toBeTruthy()
    expect(screen.getByText('Connect a Cloudflare account to see edge locations.')).toBeTruthy()
    expect(screen.getByText('cp.example.com')).toBeTruthy()
    expect(screen.getByText('Self-check failed.')).toBeTruthy()
    expect(screen.getByText('Refresh')).toBeTruthy()
  })

  it('names edge locations, routed hostnames and the edge error', () => {
    mocks.status.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ok: true,
        connector: null,
        connectorNote: 'The daemon has not reported yet.',
        edge: {
          tunnelId: 't1',
          tunnelName: 'cp',
          status: 'healthy',
          connections: 4,
          locations: ['nrt01'],
          hostnames: ['cp.example.com', 'git.example.com'],
          checkedAt: null,
        },
        edgeNote: null,
        edgeError: 'Token expired.',
      },
    })
    render(<TunnelStatusPanel hostnames={[]} />)
    expect(screen.getByText('The daemon has not reported yet.')).toBeTruthy()
    expect(screen.getByText('4 connections in nrt01')).toBeTruthy()
    expect(screen.getByText('cp.example.com, git.example.com')).toBeTruthy()
    expect(screen.getByText('Token expired.')).toBeTruthy()
  })
})
