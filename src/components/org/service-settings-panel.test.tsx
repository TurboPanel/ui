// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceRecord } from '@/lib/instance-api'
import { ServiceSettingsPanel } from './service-settings-panel'

const state = vi.hoisted(() => ({
  kind: 'site' as 'site' | 'container',
  run: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, detailCard: {}, detailTitle: {} },
}))
vi.mock('@/components/org/service-folder-settings', () => ({ ServiceFolderSettings: () => null }))
vi.mock('@/components/org/service-bindings-panel', () => ({ ServiceBindingsPanel: () => null }))
vi.mock('@/lib/queries/services', () => ({ useUpdateService: () => ({ run: state.run }) }))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironment: () => ({
    data: { environment: { projectId: 'p1', options: { compose: undefined } } },
  }),
}))
vi.mock('@/lib/queries/projects', () => ({
  useProject: () => ({
    data: {
      project: {
        options: {
          compose: {
            data: {
              services: {
                web:
                  state.kind === 'site'
                    ? { 'x-turbopanel': { serviceKind: 'site' } }
                    : { image: 'nginx' },
              },
            },
          },
        },
      },
    },
  }),
}))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  Checkbox: ({ label }: { label: string }) => <span>{label}</span>,
  SegmentedControl: ({
    accessibilityLabel,
    options,
    onChange,
  }: {
    accessibilityLabel: string
    options: { value: string; label: string }[]
    onChange: (v: string) => void
  }) => (
    <div aria-label={accessibilityLabel}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
    multiline,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
    multiline?: boolean
  }) => (
    <label>
      {label}
      {multiline ? (
        <textarea aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
      ) : (
        <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
      )}
    </label>
  ),
  Toggle: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <button aria-label={accessibilityLabel} />
  ),
}))

const service = (options: Record<string, unknown> = {}): ServiceRecord =>
  ({
    id: 'svc1',
    name: 'Site',
    description: null,
    environmentId: 'env1',
    composeServiceName: 'web',
    options,
    createdAt: '',
    updatedAt: '',
  }) as ServiceRecord

const mount = (s = service()) =>
  render(<ServiceSettingsPanel orgId="o" composeServiceName="web" service={s} canManage />)

beforeEach(() => {
  state.kind = 'site'
  state.run.mockReset()
  state.run.mockResolvedValue({ ok: true })
})
afterEach(() => cleanup())

describe('ServiceSettingsPanel PHP App section', () => {
  it('shows for a site service and not for a container', () => {
    mount()
    expect(screen.getByText('PHP App')).toBeTruthy()
    cleanup()
    state.kind = 'container'
    mount()
    expect(screen.queryByText('PHP App')).toBeNull()
  })

  it('saves edits as service options, with workers added and removed', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Post-Deploy Commands'), {
      target: { value: 'php artisan migrate --force\n\nphp artisan optimize' },
    })
    fireEvent.change(screen.getByLabelText('Timeout (Seconds)'), { target: { value: '120' } })
    fireEvent.click(screen.getByText('Right after the switch'))
    expect(screen.getByText(/new release keeps serving/)).toBeTruthy()
    fireEvent.click(screen.getByText('Add Worker'))
    fireEvent.click(screen.getByText('Add Worker'))
    expect(screen.getAllByLabelText('Name')).toHaveLength(2)
    fireEvent.click(screen.getAllByText('Remove')[1] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'queue' } })
    fireEvent.change(screen.getByLabelText('Command'), {
      target: { value: 'php artisan queue:work' },
    })
    fireEvent.change(screen.getByLabelText('Processes'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Save service settings'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    const sent = state.run.mock.calls[0]?.[0] as { options: Record<string, unknown> }
    expect(sent.options).toMatchObject({
      postDeployCommands: ['php artisan migrate --force', 'php artisan optimize'],
      postDeployTimeoutSeconds: 120,
      postDeployTiming: 'after-switch',
      workers: [{ name: 'queue', command: 'php artisan queue:work', processes: 2 }],
    })
  })

  it('shows the control plane sentence when the save is refused', async () => {
    state.run.mockResolvedValue({
      ok: false,
      error: 'The post-deploy time limit must be a whole number of seconds from 30 to 1800.',
    })
    mount()
    fireEvent.change(screen.getByLabelText('Timeout (Seconds)'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Save service settings'))
    expect(await screen.findByText(/from 30 to 1800/)).toBeTruthy()
  })

  it('hides the older post-deploy command on a site and keeps it elsewhere', () => {
    mount()
    expect(screen.queryByText('Post-deploy command')).toBeNull()
    cleanup()
    state.kind = 'container'
    mount()
    expect(screen.getByText('Post-deploy command')).toBeTruthy()
  })

  it('still sends a stored older post-deploy command from a site save', async () => {
    mount(service({ postDeployCommand: 'echo done' }))
    fireEvent.click(screen.getByText('Save service settings'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    const sent = state.run.mock.calls[0]?.[0] as { options: Record<string, unknown> }
    expect(sent.options.postDeployCommand).toBe('echo done')
  })

  it('keeps stored commands when saving a service that is not a site', async () => {
    state.kind = 'container'
    mount(service({ postDeployCommands: ['a'] }))
    fireEvent.click(screen.getByText('Save service settings'))
    await waitFor(() => expect(state.run).toHaveBeenCalled())
    const sent = state.run.mock.calls[0]?.[0] as { options: Record<string, unknown> }
    expect(sent.options.postDeployCommands).toEqual(['a'])
  })
})
