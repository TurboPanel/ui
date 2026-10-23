// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerWebServerSettingsSection } from './server-web-server-settings-section'

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
  queryKeys: { org: () => ({ settings: { hostDefaults: ['k'] } }) },
}))
vi.mock('@/lib/instance-api', () => ({
  fetchOrgHostDefaults: vi.fn(),
  saveOrgHostDefaults: vi.fn(),
}))
vi.mock('@/lib/user-error', () => ({ userErrorMessage: (_e: unknown, fallback: string) => fallback }))
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

const LABEL = 'Hide web server names and versions'

describe('ServerWebServerSettingsSection', () => {
  it('shows nothing to people who cannot manage the organization', () => {
    state.canManage = false
    state.data = { hideWebServerNames: true }
    const { container } = render(<ServerWebServerSettingsSection orgId="o" />)
    expect(container.textContent).toBe('')
  })

  it('shows names hidden by default and turns hiding off', () => {
    state.data = { hideWebServerNames: true }
    render(<ServerWebServerSettingsSection orgId="o" />)
    const toggle = screen.getByLabelText<HTMLButtonElement>(LABEL)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(state.mutate).toHaveBeenCalledWith(false)
  })

  it('turns hiding back on', () => {
    state.data = { hideWebServerNames: false }
    render(<ServerWebServerSettingsSection orgId="o" />)
    fireEvent.click(screen.getByLabelText(LABEL))
    expect(state.mutate).toHaveBeenCalledWith(true)
  })
})
