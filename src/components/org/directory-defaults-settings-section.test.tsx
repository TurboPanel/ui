// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryDefaultsSettingsSection } from './directory-defaults-settings-section'

const state = vi.hoisted(() => ({
  canManage: true,
  data: undefined as unknown,
  mutate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.data, isLoading: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/query-client', () => ({
  useCan: () => state.canManage,
  useApiMutation: () => ({ mutate: state.mutate, isPending: false }),
  queryKeys: { org: () => ({ settings: { directoryDefaults: ['k'] } }) },
}))
vi.mock('@/lib/instance-api', () => ({
  fetchOrgDirectoryDefaults: vi.fn(),
  saveOrgDirectoryDefaults: vi.fn(),
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
  SettingRow: ({ label, children }: { label: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      {children as never}
    </div>
  ),
  Select: ({
    value,
    disabled,
    onChange,
    accessibilityLabel,
  }: {
    value: string
    disabled?: boolean
    onChange: (v: string) => void
    accessibilityLabel: string
  }) => (
    <button aria-label={accessibilityLabel} disabled={disabled} onClick={() => onChange('uuid')}>
      {value}
    </button>
  ),
  Toggle: ({
    value,
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    disabled?: boolean
    onValueChange: () => void
    accessibilityLabel: string
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-pressed={value}
      disabled={disabled}
      onClick={onValueChange}
    >
      toggle
    </button>
  ),
}))

beforeEach(() => {
  state.canManage = true
  state.mutate.mockReset()
})
afterEach(() => cleanup())

const free = { names: null, effectiveNames: 'slug', locked: false, lockedByFolders: false }

describe('DirectoryDefaultsSettingsSection', () => {
  it('shows nothing to people who cannot manage the organization', () => {
    state.canManage = false
    state.data = free
    const { container } = render(<DirectoryDefaultsSettingsSection orgId="o" />)
    expect(container.textContent).toBe('')
  })

  it('lets an owner change the naming and save it', () => {
    state.data = free
    render(<DirectoryDefaultsSettingsSection orgId="o" />)
    fireEvent.click(screen.getByLabelText('How folders are named'))
    fireEvent.click(screen.getByText('Save'))
    expect(state.mutate).toHaveBeenCalledWith({ names: 'uuid', locked: false })
  })

  it('locks by hand together with a change', () => {
    state.data = free
    render(<DirectoryDefaultsSettingsSection orgId="o" />)
    fireEvent.click(screen.getByLabelText('Lock folder naming'))
    fireEvent.click(screen.getByText('Save'))
    expect(state.mutate).toHaveBeenCalledWith({ names: 'slug', locked: true })
  })

  it('is read-only when locked by folders and says why', () => {
    state.data = { ...free, locked: true, lockedByFolders: true }
    render(<DirectoryDefaultsSettingsSection orgId="o" />)
    expect(screen.getByText(/folders already exist on your servers/)).toBeTruthy()
    expect(screen.getByLabelText<HTMLButtonElement>('How folders are named').disabled).toBe(true)
    expect(screen.getByLabelText<HTMLButtonElement>('Lock folder naming').disabled).toBe(true)
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('is read-only when locked by hand and gives its own message', () => {
    state.data = { ...free, locked: true, lockedByFolders: false }
    render(<DirectoryDefaultsSettingsSection orgId="o" />)
    expect(screen.getByText(/Locked by an owner of this organization/)).toBeTruthy()
    expect(screen.queryByText(/folders already exist/)).toBeNull()
    expect(screen.getByLabelText<HTMLButtonElement>('How folders are named').disabled).toBe(true)
    expect(screen.getByLabelText<HTMLButtonElement>('Lock folder naming').disabled).toBe(true)
    expect(screen.queryByText('Save')).toBeNull()
  })
})
