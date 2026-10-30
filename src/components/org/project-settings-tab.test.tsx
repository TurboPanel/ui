// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectSettingsRedirect from '@/app/[orgId]/projects/settings'
import { ProjectSettingsTab } from './project-settings-tab'

type MutationOptions = {
  mutationFn: (v: boolean) => Promise<Record<string, boolean>>
  onSuccess: (data: Record<string, boolean>) => void
  onError: (err: unknown) => void
}

const state = vi.hoisted(() => ({
  manage: { allowed: true, loading: false },
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
  },
  save: vi.fn(),
  setQueryData: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useLocalSearchParams: () => ({ orgId: 'org-1' }),
  Redirect: ({ href }: { href: string }) => <a data-testid="redirect" href={href} />,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ setQueryData: state.setQueryData }),
}))
vi.mock('@/lib/query-client', () => ({
  useCanState: () => state.manage,
  // Runs the real mutationFn so the test sees exactly what is sent.
  useApiMutation: (options: MutationOptions) => ({
    mutate: (value: boolean) => {
      options.mutationFn(value).then(options.onSuccess, options.onError)
    },
    isPending: false,
  }),
  queryKeys: {
    org: () => ({
      settings: { projectSettings: ['settings'], projectFormDefaults: ['defaults'] },
    }),
  },
}))
vi.mock('@/lib/instance-api', () => ({
  fetchOrgProjectSettings: vi.fn(),
  saveOrgProjectSettings: (...args: unknown[]) => state.save(...args),
}))
vi.mock('@/lib/user-error', () => ({
  userErrorMessage: (_err: unknown, fallback: string) => fallback,
}))
vi.mock('@/components/org/default-environment-settings-section', () => ({
  DefaultEnvironmentSettingsSection: () => <div>Primary Environment Name</div>,
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  LoadingState: () => <div role="progressbar">Loading…</div>,
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
  Toggle: ({
    value,
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    disabled?: boolean
    onValueChange: (next: boolean) => void
    accessibilityLabel: string
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-pressed={value}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    >
      toggle
    </button>
  ),
}))

const ENVIRONMENT = 'Open the Environment section by default'
const WORKSPACE = 'Open the Workspace section by default'

beforeEach(() => {
  state.manage = { allowed: true, loading: false }
  state.query = {
    data: { openEnvironmentSectionByDefault: false, openWorkspaceSectionByDefault: false },
    isLoading: false,
    isError: false,
    error: null,
  }
  state.save.mockReset()
  state.setQueryData.mockReset()
})
afterEach(() => cleanup())

describe('ProjectSettingsTab', () => {
  it('shows only a note to people who cannot manage the organization', () => {
    state.manage = { allowed: false, loading: false }
    render(<ProjectSettingsTab orgId="org-1" />)
    expect(screen.getByText(/Only organization owners and managers/)).toBeTruthy()
    expect(screen.queryByLabelText(ENVIRONMENT)).toBeNull()
    expect(screen.queryByText('Managed Database Settings')).toBeNull()
  })

  it('shows a loading state while the permission or the settings load', () => {
    state.manage = { allowed: false, loading: true }
    render(<ProjectSettingsTab orgId="org-1" />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText(/Only organization owners and managers/)).toBeNull()
  })

  it('sends only the pressed switch, and the other switch stays usable while it saves', async () => {
    state.save.mockReturnValue(new Promise(() => {}))
    render(<ProjectSettingsTab orgId="org-1" />)
    fireEvent.click(screen.getByLabelText(ENVIRONMENT))
    expect(state.save).toHaveBeenCalledWith('org-1', { openEnvironmentSectionByDefault: true })
    expect(screen.getByLabelText(ENVIRONMENT).getAttribute('aria-pressed')).toBe('true')
    const workspace = screen.getByLabelText(WORKSPACE) as HTMLButtonElement
    expect(workspace.disabled).toBe(false)
    fireEvent.click(workspace)
    expect(state.save).toHaveBeenLastCalledWith('org-1', { openWorkspaceSectionByDefault: true })
  })

  it('updates both caches with the saved switch only', async () => {
    state.save.mockResolvedValue({
      ok: true,
      openEnvironmentSectionByDefault: true,
      openWorkspaceSectionByDefault: false,
    })
    render(<ProjectSettingsTab orgId="org-1" />)
    await act(async () => {
      fireEvent.click(screen.getByLabelText(ENVIRONMENT))
    })
    const keys = state.setQueryData.mock.calls.map(([key]) => key)
    expect(keys).toEqual([['settings'], ['defaults']])
    const update = state.setQueryData.mock.calls[0][1] as (before: unknown) => unknown
    expect(
      update({ openEnvironmentSectionByDefault: false, openWorkspaceSectionByDefault: true })
    ).toEqual({ openEnvironmentSectionByDefault: true, openWorkspaceSectionByDefault: true })
  })

  it('puts the switch back and says so when the save fails', async () => {
    state.save.mockRejectedValue(new Error('nope'))
    render(<ProjectSettingsTab orgId="org-1" />)
    await act(async () => {
      fireEvent.click(screen.getByLabelText(ENVIRONMENT))
    })
    expect(screen.getByLabelText(ENVIRONMENT).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Failed to save the new project form settings')).toBeTruthy()
  })

  it('shows the load error when the settings cannot be read', () => {
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error('x') }
    render(<ProjectSettingsTab orgId="org-1" />)
    expect(screen.getByText('Failed to load the new project form settings')).toBeTruthy()
  })
})

describe('/projects/settings', () => {
  it('redirects to Organization Settings › Project Settings', () => {
    render(<ProjectSettingsRedirect />)
    expect(screen.getByTestId('redirect').getAttribute('href')).toContain('tab=projects')
  })
})
