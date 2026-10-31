// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrgFabricServerRecord } from '@/lib/instance-api'
import { FabricServerControls } from './fabric-server-controls'

const { usePatchOrgFabricServer, mutate } = vi.hoisted(() => ({
  usePatchOrgFabricServer: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./fabric-test-ui-stub')).fabricUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./fabric-test-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/fabric', () => ({ usePatchOrgFabricServer }))

function server(overrides: Partial<OrgFabricServerRecord> = {}): OrgFabricServerRecord {
  return {
    serverId: 'srv-1',
    name: 'alpha',
    enabled: true,
    member: true,
    role: 'gateway',
    roleSource: 'automatic',
    automaticRole: 'gateway',
    ...overrides,
  }
}

beforeEach(() => {
  usePatchOrgFabricServer.mockReturnValue({ mutate, isPending: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FabricServerControls', () => {
  it('shows the role Automatic resolves to and whether the server holds an address', () => {
    render(<FabricServerControls orgId="org-1" server={server()} canManage showName />)
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('Has a TurboFabric address')).toBeTruthy()
    const automatic = screen.getByRole('tab', { name: 'Automatic (Gateway)' })
    expect(automatic.getAttribute('aria-selected')).toBe('true')
    expect(usePatchOrgFabricServer).toHaveBeenCalledWith('org-1', 'srv-1')
  })

  it('asks before switching the server off and sends enabled false on confirm', () => {
    render(<FabricServerControls orgId="org-1" server={server()} canManage />)
    fireEvent.click(screen.getByRole('switch'))
    expect(mutate).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Take This Server Off TurboFabric' })
    expect(dialog.textContent).toContain("alpha's tunnel goes down")
    fireEvent.click(screen.getByRole('button', { name: 'Switch Off' }))
    expect(mutate).toHaveBeenCalledWith({ enabled: false }, expect.anything())
  })

  it('closes the confirm without a request on Cancel', () => {
    render(<FabricServerControls orgId="org-1" server={server()} canManage />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('switches a server back on without a confirm', () => {
    render(
      <FabricServerControls
        orgId="org-1"
        server={server({ enabled: false, member: false })}
        canManage
      />
    )
    expect(screen.getByText('No TurboFabric address yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutate).toHaveBeenCalledWith({ enabled: true }, expect.anything())
  })

  it('writes an operator role and null for Automatic', () => {
    const { rerender } = render(<FabricServerControls orgId="org-1" server={server()} canManage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Client' }))
    expect(mutate).toHaveBeenLastCalledWith({ role: 'client' }, expect.anything())

    rerender(
      <FabricServerControls
        orgId="org-1"
        server={server({ role: 'client', roleSource: 'operator' })}
        canManage
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Automatic (Gateway)' }))
    expect(mutate).toHaveBeenLastCalledWith({ role: null }, expect.anything())
  })

  it("shows the control plane's own words when it refuses", () => {
    mutate.mockImplementation((_body, options: { onError: (err: unknown) => void }) => {
      options.onError(
        new Error(
          '/api/client/v1/organizations/org-1/fabric/servers/srv-1 failed: HTTP 409: fabric_server_in_use — alpha carries the web network for shop.'
        )
      )
    })
    render(<FabricServerControls orgId="org-1" server={server()} canManage />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch Off' }))
    expect(screen.getByText('alpha carries the web network for shop.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disables the controls without manage permission', () => {
    render(<FabricServerControls orgId="org-1" server={server()} canManage={false} />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('tab', { name: 'Client' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
