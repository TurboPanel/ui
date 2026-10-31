// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FabricPairRow } from '@/lib/fabric-mesh'
import { FabricPairPathList } from './fabric-pair-paths'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./fabric-test-ui-stub')).panelStylesStub
)

afterEach(() => {
  cleanup()
})

const lanRow: FabricPairRow = {
  key: 'a:b',
  title: 'alpha ↔ bravo',
  path: 'lan',
  pathLabel: 'LAN',
  reason: 'They share the trusted network Rack A.',
}

const tunnelRow: FabricPairRow = {
  key: 'a:c',
  title: 'alpha ↔ charlie',
  path: 'fabric_over_untrusted_lan',
  pathLabel: 'TurboFabric over LAN',
  reason: 'Their shared network is untrusted, so the tunnel runs over it.',
  latencyMs: 3,
  viaLabel: 'delta',
  warning: 'Degraded',
}

describe('FabricPairPathList', () => {
  it('shows each pair with its path label and the reason sentence', () => {
    render(<FabricPairPathList rows={[lanRow, tunnelRow]} />)
    expect(screen.getByText('alpha ↔ bravo')).toBeTruthy()
    expect(screen.getByText('They share the trusted network Rack A.')).toBeTruthy()
    expect(screen.getByText(/TurboFabric over LAN/).textContent).toContain('3 ms')
    expect(screen.getByText('delta')).toBeTruthy()
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getAllByText('Why:', { exact: false })).toHaveLength(2)
  })

  it('shows no tunnel lines for a LAN pair', () => {
    render(<FabricPairPathList rows={[lanRow]} />)
    expect(screen.queryByText('Via:', { exact: false })).toBeNull()
    expect(screen.queryByText(/ ms/)).toBeNull()
  })
})
