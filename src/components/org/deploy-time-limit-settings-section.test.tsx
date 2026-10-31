// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeployTimeLimitSettingsSection } from './deploy-time-limit-settings-section'

type MutationOptions = {
  mutationFn: (v: number) => Promise<{ deployTimeoutMinutes: number }>
  onSuccess: (data: { deployTimeoutMinutes: number }) => void
  onError: (err: unknown) => void
}

const state = vi.hoisted(() => ({
  manage: true,
  query: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
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
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ setQueryData: state.setQueryData }),
}))
vi.mock('@/lib/query-client', () => ({
  useCan: () => state.manage,
  useApiMutation: (options: MutationOptions) => {
    const [isPending, setPending] = useState(false)
    return {
      mutate: (value: number) => {
        setPending(true)
        options.mutationFn(value).then(
          (data) => {
            setPending(false)
            options.onSuccess(data)
          },
          (err: unknown) => {
            setPending(false)
            options.onError(err)
          }
        )
      },
      isPending,
    }
  },
  queryKeys: { org: () => ({ settings: { deployTimeout: ['deploy-timeout'] } }) },
}))
vi.mock('@/lib/user-error', () => ({
  userErrorMessage: (_err: unknown, fallback: string) => fallback,
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
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
  TextField: ({
    value,
    onChangeText,
    hint,
  }: {
    value: string
    onChangeText: (t: string) => void
    hint?: string
  }) => (
    <div>
      <input value={value} onChange={(e) => onChangeText(e.target.value)} />
      <p>{hint}</p>
    </div>
  ),
}))
vi.mock('@/lib/instance-api', () => ({
  fetchOrgDeployTimeout: vi.fn(),
  saveOrgDeployTimeout: (...args: unknown[]) => state.save(...args),
}))

describe('DeployTimeLimitSettingsSection', () => {
  beforeEach(() => {
    state.manage = true
    state.query = {
      data: { deployTimeoutMinutes: 45 },
      isLoading: false,
      isError: false,
      error: null,
    }
    state.save.mockReset()
    state.setQueryData.mockReset()
  })
  afterEach(cleanup)

  const field = () => screen.getByDisplayValue('45') as HTMLInputElement

  it('renders nothing without the manage permission', () => {
    state.manage = false
    const { container } = render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    expect(container.textContent).toBe('')
  })

  it('blocks an out-of-range value and shows plain words', () => {
    render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    fireEvent.change(field(), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Save Time Limit'))
    expect(state.save).not.toHaveBeenCalled()
    expect(screen.getByText(/whole number of minutes from 5 to 240/)).toBeTruthy()
  })

  it('saves a valid value', async () => {
    state.save.mockResolvedValue({ ok: true, deployTimeoutMinutes: 60 })
    render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    fireEvent.change(field(), { target: { value: '60' } })
    fireEvent.click(screen.getByText('Save Time Limit'))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('org-1', 60))
    await waitFor(() =>
      expect(state.setQueryData).toHaveBeenCalledWith(['deploy-timeout'], {
        deployTimeoutMinutes: 60,
      })
    )
  })

  it('restores the default by sending 30', async () => {
    state.save.mockResolvedValue({ ok: true, deployTimeoutMinutes: 30 })
    render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    fireEvent.click(screen.getByText('Restore Default'))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('org-1', 30))
  })

  it('shows a plain error when the load fails', () => {
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error('x') }
    render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    expect(screen.getByText('Could not load the deploy time limit.')).toBeTruthy()
  })

  it('says it is loading while the limit is read', () => {
    state.query = { data: undefined, isLoading: true, isError: false, error: null }
    render(<DeployTimeLimitSettingsSection orgId="org-1" />)
    expect(screen.getByText('Loading the deploy time limit…')).toBeTruthy()
  })
})
