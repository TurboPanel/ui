// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Props = {
  label?: string
  title?: string
  body?: string
  value?: unknown
  disabled?: boolean
  accessibilityLabel?: string
  onPress?: () => void
  onChangeText?: (text: string) => void
  children?: ReactNode
}

const hooks = vi.hoisted(() => ({
  preferences: vi.fn(),
  channels: vi.fn(),
  events: vi.fn(),
  create: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), canGoBack: () => false }),
}))
vi.mock('@/lib/theme', () => ({
  colors: new Proxy({}, { get: () => 'token' }),
  spacing: new Proxy({}, { get: () => 0 }),
  webPointer: {},
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/screen-safe-area', () => ({
  ScreenSafeArea: (props: Props) => <div>{props.children}</div>,
}))
vi.mock('@/components/ui', () => {
  const action = (props: Props) => (
    <button type="button" disabled={Boolean(props.disabled)} onClick={() => props.onPress?.()}>
      {props.label}
    </button>
  )
  const box = (props: Props) => <div>{props.children}</div>
  return {
    Badge: (props: Props) => <span>{props.label}</span>,
    Button: action,
    ButtonRow: box,
    Checkbox: (props: Props) => <span>{props.label}</span>,
    EmptyState: (props: Props) => <p>{props.title}</p>,
    InlineNotice: (props: Props) => <div role="status">{props.title}</div>,
    LoadingState: (props: Props) => <div role="progressbar">{props.label}</div>,
    SectionPanel: (props: Props) => <section aria-label={props.title}>{props.children}</section>,
    SegmentedControl: (props: Props) => <div aria-label={props.accessibilityLabel} />,
    Select: () => <div />,
    TextField: (props: Props) => (
      <label>
        {props.label}
        <input
          value={typeof props.value === 'string' ? props.value : ''}
          onChange={(event) => props.onChangeText?.(event.target.value)}
        />
      </label>
    ),
    TextLink: action,
    // Stands for the rules editor: it is the only switch on the add form.
    Toggle: (props: Props) => <span role="switch" aria-label={props.accessibilityLabel} />,
    TypeNameDeleteButton: action,
  }
})
vi.mock('@/components/account/notification-preferences-section', () => ({
  GlobalNotificationPreferences: () => null,
  NotificationOverridesList: () => null,
  OrganizationNotificationPreferences: () => null,
}))
vi.mock('@/lib/queries/auth', () => ({
  useOrganizationsQuery: () => ({ data: { organizations: [] } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useTimezones: () => ({ data: undefined }) }))
vi.mock('@/lib/queries/notification-preferences', () => ({
  useNotificationPreferencesQuery: hooks.preferences,
}))
vi.mock('@/lib/queries/notifications', () => {
  const idle = () => ({ run: vi.fn(), isPending: false })
  return {
    useNotificationChannelsQuery: hooks.channels,
    useNotificationEventsQuery: hooks.events,
    useCreateNotificationChannel: () => ({ run: hooks.create, isPending: false }),
    useDeleteNotificationChannel: idle,
    useResendChannelVerification: idle,
    useUpdateNotificationChannel: idle,
  }
})

const { NotificationChannelsSectionContent } = await import('./notification-channels-section')

const EVENT = {
  event: 'server.offline',
  scope: 'organization',
  severity: 'critical',
  label: 'A server went offline',
  example: 'Server db-1 went offline',
}

function addChannel() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ops' } })
  fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'ops@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Channel' }))
}

beforeEach(() => {
  hooks.channels.mockReturnValue({ data: [], isLoading: false, isError: false })
  hooks.events.mockReturnValue({ data: [EVENT] })
  hooks.create.mockResolvedValue({ ok: true, value: { kind: 'email', verifiedAt: 'now' } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Your Channels: what decides where a personal channel gets its events', () => {
  it('follows the notification settings when the control plane has them: no rules sent', () => {
    hooks.preferences.mockReturnValue({ data: {}, isLoading: false, error: null })
    render(<NotificationChannelsSectionContent />)
    expect(screen.getByText(/follows your notification settings above/)).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Deliver every event' })).toBeNull()
    // The event list is not read for a channel that has no rules.
    expect(hooks.events).toHaveBeenCalledWith({ enabled: false })
    addChannel()
    expect(hooks.create).toHaveBeenCalledTimes(1)
    expect(hooks.create.mock.calls[0][0]).toEqual({
      kind: 'email',
      label: 'Ops',
      address: 'ops@example.test',
    })
  })

  it('keeps the rules editor on a control plane without those settings, and says why', () => {
    hooks.preferences.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('/api/client/v1/notification-preferences failed: HTTP 404'),
    })
    render(<NotificationChannelsSectionContent />)
    expect(screen.getByText(/older than this web interface/)).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Deliver every event' })).toBeTruthy()
    expect(screen.queryByText(/follows your notification settings above/)).toBeNull()
    expect(hooks.events).toHaveBeenCalledWith({ enabled: true })
    addChannel()
    // A channel made here without rules would receive nothing.
    expect(hooks.create.mock.calls[0][0]).toEqual({
      kind: 'email',
      label: 'Ops',
      address: 'ops@example.test',
      rules: [{ event: '*', minSeverity: 'warning' }],
    })
  })

  it('offers no add form until it is known which of the two applies', () => {
    hooks.preferences.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<NotificationChannelsSectionContent />)
    expect(screen.queryByRole('button', { name: 'Add Channel' })).toBeNull()
  })

  it('a read that failed for another reason does not bring the rules editor back', () => {
    hooks.preferences.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('/api/client/v1/notification-preferences failed: HTTP 503'),
    })
    render(<NotificationChannelsSectionContent />)
    expect(screen.queryByRole('switch', { name: 'Deliver every event' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Channel' })).toBeTruthy()
  })
})
