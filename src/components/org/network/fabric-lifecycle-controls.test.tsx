// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FabricLifecycleControls } from './fabric-lifecycle-controls'

const { useSaveOrgFabric, useRemoveOrgFabric, save, remove } = vi.hoisted(() => ({
  useSaveOrgFabric: vi.fn(),
  useRemoveOrgFabric: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./fabric-test-ui-stub')).fabricUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./fabric-test-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/fabric', () => ({ useSaveOrgFabric, useRemoveOrgFabric }))

beforeEach(() => {
  useSaveOrgFabric.mockReturnValue({ mutate: save, isPending: false })
  useRemoveOrgFabric.mockReturnValue({ mutate: remove, isPending: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FabricLifecycleControls', () => {
  it('turning off asks first, then pauses (keeps keys) instead of removing', () => {
    render(<FabricLifecycleControls orgId="org-1" state="on" hasFabric disabled={false} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(save).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Turn Off TurboFabric' })
    expect(dialog.textContent).toContain('Keys and container networks are kept')
    fireEvent.click(screen.getByRole('button', { name: 'Turn Off TurboFabric' }))
    expect(save).toHaveBeenCalledWith({ enabled: false }, expect.anything())
    expect(remove).not.toHaveBeenCalled()
  })

  it('remove has its own confirm and calls the remove request', () => {
    render(<FabricLifecycleControls orgId="org-1" state="paused" hasFabric disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove TurboFabric Completely' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove TurboFabric Completely' })
    expect(dialog.textContent).toContain(
      'networks whose servers all share a trusted LAN, which are kept'
    )
    const buttons = screen.getAllByRole('button', { name: 'Remove TurboFabric Completely' })
    fireEvent.click(buttons.at(-1) as HTMLElement)
    expect(remove).toHaveBeenCalledWith(undefined, expect.anything())
    expect(save).not.toHaveBeenCalled()
  })

  it('cancel closes the confirm without a request', () => {
    render(<FabricLifecycleControls orgId="org-1" state="on" hasFabric disabled={false} />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('a paused fabric with no server confirmation never claims tunnels are down', () => {
    render(<FabricLifecycleControls orgId="org-1" state="paused" hasFabric disabled={false} />)
    expect(screen.queryByText(/turning it back on is instant/)).toBeNull()
    expect(screen.getByText(/no server has confirmed that its tunnel is down yet/)).toBeTruthy()
  })

  it('a paused fabric can be turned off again, after the same confirm', () => {
    render(<FabricLifecycleControls orgId="org-1" state="paused" hasFabric disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn Off Again' }))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Turn Off TurboFabric' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn Off TurboFabric' }))
    expect(save).toHaveBeenCalledWith({ enabled: false }, expect.anything())
  })

  it('a paused fabric every server confirmed shows the kept notice and resumes without a confirm', () => {
    render(
      <FabricLifecycleControls
        orgId="org-1"
        state="paused"
        hasFabric
        disabled={false}
        serverOutcomes={[
          { name: 'a', reconcile: { commandId: 'c1', action: 'pause', state: 'done', at: 't' } },
        ]}
      />
    )
    expect(screen.getByText(/turning it back on is instant/)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(save).toHaveBeenCalledWith({ enabled: true }, expect.anything())
  })

  it('a paused fabric names each server that could not take its tunnel down', () => {
    render(
      <FabricLifecycleControls
        orgId="org-1"
        state="paused"
        hasFabric
        disabled={false}
        serverOutcomes={[
          {
            name: 'a',
            reconcile: { commandId: 'c1', action: 'pause', state: 'done', at: 't' },
          },
          {
            name: 'w',
            reconcile: {
              commandId: 'c2',
              action: 'pause',
              state: 'failed',
              at: 't',
              error: 'TurboFabric pause did not finish: delete tp0: busy',
            },
          },
        ]}
      />
    )
    expect(screen.queryByText(/turning it back on is instant/)).toBeNull()
    expect(screen.getByText(/could not take their tunnel down/)).toBeTruthy()
    expect(screen.getByText('w: TurboFabric pause did not finish: delete tp0: busy')).toBeTruthy()
  })

  it('a pause still in progress counts the servers that confirmed', () => {
    render(
      <FabricLifecycleControls
        orgId="org-1"
        state="paused"
        hasFabric
        disabled={false}
        serverOutcomes={[
          { name: 'a', reconcile: { commandId: 'c1', action: 'pause', state: 'done', at: 't' } },
          { name: 'w', reconcile: { commandId: 'c2', action: 'pause', state: 'pending', at: 't' } },
        ]}
      />
    )
    expect(screen.getByText(/1 of 2 servers have taken their tunnel down/)).toBeTruthy()
  })

  it('hides remove when there is no fabric', () => {
    render(<FabricLifecycleControls orgId="org-1" state="off" hasFabric={false} disabled={false} />)
    expect(screen.queryByRole('button', { name: 'Remove TurboFabric Completely' })).toBeNull()
  })

  it("shows the control plane's message when a pause is refused", () => {
    save.mockImplementation((_body, options: { onError: (err: unknown) => void }) => {
      options.onError(
        new Error(
          '/api/client/v1/organizations/org-1/fabric failed: HTTP 409: fabric_pause_needs_daemon_update — TurboFabric is still on: alpha runs a TurboPanel daemon too old.'
        )
      )
    })
    render(<FabricLifecycleControls orgId="org-1" state="on" hasFabric disabled={false} />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Turn Off TurboFabric' }))
    expect(
      screen.getByText('TurboFabric is still on: alpha runs a TurboPanel daemon too old.')
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
