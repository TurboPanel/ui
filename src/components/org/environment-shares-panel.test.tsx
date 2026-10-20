// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentSharesPanel } from './environment-shares-panel'

const state = vi.hoisted(() => ({
  canManage: true,
  shares: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  add: { mutate: vi.fn(), isPending: false, actionError: null as string | null },
  remove: {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined as string | undefined,
    actionError: null as string | null,
  },
  environments: [{ id: 'e1' }, { id: 'e2' }],
  services: { e2: [] as unknown[] } as Record<string, unknown[]>,
  volumes: [] as unknown[],
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canManage }))
vi.mock('@/lib/queries/folders', () => ({
  useEnvironmentShares: () => state.shares,
  useAddEnvironmentShare: () => state.add,
  useRemoveEnvironmentShare: () => state.remove,
  useCommonVolumesOfEnvironments: () => state.volumes,
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: () => ({ data: { environments: state.environments } }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServicesByEnvironments: () => ({ servicesByEnv: state.services }),
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ConfirmButton: ({
    label,
    onConfirm,
    busy,
    disabled,
  }: {
    label: string
    onConfirm: () => void
    busy?: boolean
    disabled?: boolean
  }) => (
    <button disabled={disabled} data-busy={String(busy)} onClick={onConfirm}>
      {label}
    </button>
  ),
  LoadingState: ({ label }: { label?: string }) => <div>{label}</div>,
  SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
  Select: ({
    options,
    onChange,
  }: {
    options: { value: string; label: string }[]
    onChange: (v: string) => void
  }) => (
    <div>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}))

const share = {
  id: 'sh1',
  environmentId: 'e1',
  kind: 'volume',
  assetId: 'v1',
  assetName: 'Uploads',
}

beforeEach(() => {
  state.canManage = true
  state.shares = { data: { ok: true, shares: [] }, isLoading: false, isError: false, error: null }
  state.add = { mutate: vi.fn(), isPending: false, actionError: null }
  state.remove = { mutate: vi.fn(), isPending: false, variables: undefined, actionError: null }
  state.services = { e2: [] }
  state.volumes = []
})
afterEach(() => cleanup())

const mount = () => render(<EnvironmentSharesPanel orgId="o" projectId="p" environmentId="e1" />)

describe('EnvironmentSharesPanel', () => {
  it('says it is loading and does not vanish while the list loads', () => {
    state.shares = { data: undefined, isLoading: true, isError: false, error: null }
    mount()
    expect(screen.getByText('Checking shared items…')).toBeTruthy()
  })

  it('shows the failure instead of hiding', () => {
    state.shares = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('HTTP 500: boom'),
    }
    mount()
    expect(screen.getByText(/HTTP 500: boom/)).toBeTruthy()
  })

  it('stays out of the way when nothing is shared and nothing can be', () => {
    const { container } = mount()
    expect(container.textContent).toBe('')
  })

  it('lists what is in use and stops using one, with the button busy meanwhile', () => {
    state.shares = { data: { ok: true, shares: [share] }, isLoading: false, isError: false, error: null }
    const { rerender } = mount()
    expect(screen.getByText('Uploads (volume)')).toBeTruthy()
    fireEvent.click(screen.getByText('Stop using'))
    expect(state.remove.mutate).toHaveBeenCalledWith('sh1')

    state.remove = { ...state.remove, isPending: true, variables: 'sh1' }
    rerender(<EnvironmentSharesPanel orgId="o" projectId="p" environmentId="e1" />)
    const button = screen.getByText('Stop using') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.dataset.busy).toBe('true')
  })

  it('offers shared items from other environments and starts using the pick', () => {
    state.volumes = [{ id: 'v9', name: 'Media', common: true }]
    state.services = { e2: [{ id: 's9', name: 'Site', composeServiceName: 'web', common: true }] }
    mount()
    fireEvent.click(screen.getByText('Media (volume)'))
    fireEvent.click(screen.getByText('Use it'))
    expect(state.add.mutate).toHaveBeenCalledWith({ storageId: 'v9' }, expect.anything())
    expect(screen.getByText('Site (service)')).toBeTruthy()
  })

  it('does not offer to change anything to people who cannot manage', () => {
    state.canManage = false
    state.shares = { data: { ok: true, shares: [share] }, isLoading: false, isError: false, error: null }
    mount()
    expect(screen.queryByText('Stop using')).toBeNull()
    expect(screen.queryByText('Use it')).toBeNull()
  })
})
