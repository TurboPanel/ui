// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NotificationEffectiveLevels,
  NotificationPreferenceRow,
  NotificationPreferences,
} from '@/lib/instance-api'

const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PROJECT = '00000000-0000-4000-8000-0000000000a1'
const SERVER = '00000000-0000-4000-8000-0000000000c1'
const CHANNEL = '00000000-0000-4000-8000-0000000000d1'

type Props = {
  label?: string
  title?: string
  body?: string
  hint?: string
  description?: string
  value?: unknown
  placeholder?: string
  disabled?: boolean
  expanded?: boolean
  accessibilityLabel?: string
  options?: readonly { value: string; label: string }[]
  onPress?: () => void
  onChange?: (value: string | null) => void
  onValueChange?: (value: boolean) => void
  children?: ReactNode
}

type Outcome = { ok: true; value?: unknown } | { ok: false; error: string; cause: unknown }

const hooks = vi.hoisted(() => ({
  preferences: vi.fn(),
  forOrganizations: vi.fn(),
  effective: vi.fn(),
  scopeNames: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  removeMany: vi.fn(),
  preset: vi.fn(),
  settings: vi.fn(),
  organizations: vi.fn(),
  projects: vi.fn(),
  environments: vi.fn(),
  servers: vi.fn(),
  push: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: hooks.push }) }))
vi.mock('@/lib/theme', () => ({
  colors: new Proxy({}, { get: () => 'token' }),
  spacing: new Proxy({}, { get: () => 0 }),
}))
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: { role: 'muted' }, error: { role: 'error' } },
}))
vi.mock('@/components/ui', () => {
  const action = (props: Props) => (
    <button
      type="button"
      aria-label={props.accessibilityLabel ?? props.label}
      aria-expanded={props.expanded}
      disabled={Boolean(props.disabled)}
      onClick={() => props.onPress?.()}
    >
      {props.label}
    </button>
  )
  return {
    Button: action,
    TextLink: action,
    ButtonRow: (props: Props) => <div>{props.children}</div>,
    InlineNotice: (props: Props) => (
      <div role="status" aria-label={props.title}>
        {props.body}
      </div>
    ),
    LoadingState: (props: Props) => <div role="progressbar">{props.label}</div>,
    SectionPanel: (props: Props) => (
      <section aria-label={props.title}>
        <p>{props.hint}</p>
        {props.children}
      </section>
    ),
    SegmentedControl: (props: Props) => (
      <div role="radiogroup" aria-label={props.accessibilityLabel} data-value={String(props.value)}>
        {(props.options ?? []).map((option) => (
          <button key={option.value} type="button" onClick={() => props.onChange?.(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    ),
    // A plain select: the empty option stands for "Same as Above".
    Select: (props: Props) => (
      <select
        aria-label={props.accessibilityLabel}
        value={typeof props.value === 'string' ? props.value : ''}
        onChange={(event) => props.onChange?.(event.target.value || null)}
      >
        <option value="">{props.placeholder}</option>
        {(props.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    SettingRow: (props: Props) => (
      <div role="group" aria-label={props.label}>
        <span>{props.label}</span>
        {props.children}
      </div>
    ),
    Toggle: (props: Props) => (
      <button
        type="button"
        role="switch"
        aria-checked={props.value === true}
        aria-label={props.accessibilityLabel}
        onClick={() => props.onValueChange?.(props.value !== true)}
      />
    ),
  }
})
vi.mock('@/lib/queries/notification-preferences', () => {
  const mutation = (run: (variables: unknown) => Promise<Outcome>) => () => ({
    run,
    isPending: false,
  })
  return {
    useNotificationPreferencesQuery: hooks.preferences,
    useNotificationPreferencesForOrganizations: hooks.forOrganizations,
    useEffectiveNotificationLevels: hooks.effective,
    useNotificationScopeNames: hooks.scopeNames,
    usePutNotificationPreference: mutation(hooks.put),
    useDeleteNotificationPreference: mutation(hooks.remove),
    useDeleteNotificationPreferences: mutation(hooks.removeMany),
    useApplyNotificationPreset: mutation(hooks.preset),
    useUpdateNotificationSettings: mutation(hooks.settings),
  }
})
vi.mock('@/lib/queries/auth', () => ({ useOrganizationsQuery: hooks.organizations }))
vi.mock('@/lib/queries/projects', () => ({ useProjects: hooks.projects }))
vi.mock('@/lib/queries/environments', () => ({ useEnvironments: hooks.environments }))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: hooks.servers }))

const {
  GlobalNotificationPreferences,
  NotificationOverridesList,
  OrganizationNotificationPreferences,
} = await import('./notification-preferences-section')

let seq = 0
function row(patch: Partial<NotificationPreferenceRow>): NotificationPreferenceRow {
  seq += 1
  return {
    id: `row-${String(seq).padStart(3, '0')}`,
    userId: 'u-1',
    organizationId: null,
    projectId: null,
    environmentId: null,
    serviceId: null,
    serverId: null,
    destinationId: null,
    channelId: null,
    categoryCode: null,
    topicCode: null,
    kind: null,
    level: 'all',
    endsAt: null,
    scope: 'global',
    ...patch,
  }
}

const UNSET = { level: 'none', source: 'default', sourceId: null } as const
const ON_HERE = { level: 'all', source: 'organization', sourceId: 'r' } as const

function preferences(
  rows: NotificationPreferenceRow[],
  effective: Partial<NotificationEffectiveLevels> = {},
  patch: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    rows,
    channels: [
      {
        id: 'ch-primary',
        kind: 'email',
        label: 'Account Email',
        isPrimary: true,
        verified: true,
        disabled: false,
        address: 'a@example.test',
      },
      {
        id: CHANNEL,
        kind: 'email',
        label: 'Work Email',
        isPrimary: false,
        verified: true,
        disabled: false,
        address: 'w@example.test',
      },
    ],
    catalog: {
      categories: [
        { code: 'servers', name: 'Servers' },
        { code: 'backups', name: 'Backups' },
      ],
      topics: [
        {
          code: 'server.offline',
          name: 'A server went offline',
          categoryCode: 'servers',
          severity: 'critical',
          audience: 'members',
          scope: 'organization',
          urgent: true,
        },
      ],
    },
    presets: {
      everything: { inbox: 'all', email: 'all' },
      recommended: { inbox: 'all', email: 'warning' },
      critical: { inbox: 'critical', email: 'critical' },
      nothing: { inbox: 'none', email: 'none' },
    },
    effective: { inbox: UNSET, email: UNSET, chat: UNSET, webhook: UNSET, ...effective },
    administrator: false,
    allOrganizations: false,
    ...patch,
  }
}

function loaded<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null }
}

const LOADING = { data: undefined, isLoading: true, isError: false, error: null }

function failed(message: string) {
  return { data: undefined, isLoading: false, isError: true, error: new Error(message) }
}

const SAVE_FAILED: Outcome = { ok: false, error: 'x', cause: new Error('x failed: HTTP 503') }

beforeEach(() => {
  hooks.put.mockResolvedValue({ ok: true })
  hooks.remove.mockResolvedValue({ ok: true })
  hooks.removeMany.mockResolvedValue({ ok: true })
  hooks.preset.mockResolvedValue({ ok: true })
  hooks.settings.mockResolvedValue({ ok: true })
  hooks.effective.mockReturnValue(loaded(undefined))
  hooks.scopeNames.mockReturnValue(loaded(undefined))
  hooks.forOrganizations.mockReturnValue([])
  hooks.organizations.mockReturnValue(loaded({ organizations: [] }))
  hooks.projects.mockReturnValue(loaded({ projects: [{ id: PROJECT, name: 'Checkout' }] }))
  hooks.environments.mockReturnValue(loaded({ environments: [] }))
  hooks.servers.mockReturnValue(loaded({ servers: [{ id: SERVER, name: 'db-1' }] }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Organization Settings > Notifications: Your Notifications', () => {
  /** Everything preset, then an unsubscribe from a Servers email in this organization. */
  function unsubscribedFromServers() {
    const unsubscribed = row({
      organizationId: ORG,
      categoryCode: 'servers',
      kind: 'email',
      level: 'none',
    })
    const rows = [
      row({ organizationId: ORG, kind: 'inbox', level: 'all' }),
      row({ organizationId: ORG, kind: 'email', level: 'all' }),
      unsubscribed,
    ]
    hooks.preferences.mockReturnValue(loaded(preferences(rows, { inbox: ON_HERE, email: ON_HERE })))
    return unsubscribed
  }

  it('shows the row an email unsubscribe wrote, what it does, and removes it', async () => {
    const unsubscribed = unsubscribedFromServers()
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    const servers = screen.getByRole('group', { name: 'Servers' })
    // The picker alone would say "Same as Above"; the line under it says what applies.
    expect((within(servers).getByRole('combobox') as HTMLSelectElement).value).toBe('')
    expect(
      within(servers).getByRole('combobox', {
        name: 'Servers level. In effect: Bell: All · Email: Off (Set here)',
      })
    ).toBeTruthy()
    expect(screen.getByText('In effect: Bell: All · Email: Off (Set here)')).toBeTruthy()
    expect(screen.getByText('Email: Off')).toBeTruthy()
    expect(screen.getByText('Servers only')).toBeTruthy()
    // Backups follows the levels above: no extra line, a plain label.
    expect(screen.getByRole('combobox', { name: 'Backups level' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Email: Off, Servers only' }))
    expect(hooks.remove).toHaveBeenCalledTimes(1)
    expect(hooks.remove).toHaveBeenCalledWith({ id: unsubscribed.id, organizationId: ORG })
    expect(screen.queryByRole('status', { name: 'Nothing is turned on' })).toBeNull()
  })

  it('setting the category does not claim to undo the unsubscribe', () => {
    unsubscribedFromServers()
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    fireEvent.change(screen.getByRole('combobox', { name: /^Servers level/ }), {
      target: { value: 'all' },
    })
    // The picker writes the category for every channel; the email row stays listed.
    expect(hooks.put).toHaveBeenCalledWith({
      organizationId: ORG,
      categoryCode: 'servers',
      kind: null,
      level: 'all',
    })
    expect(hooks.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove Email: Off, Servers only' })).toBeTruthy()
  })

  it('names the channel of an unsubscribe from another address', () => {
    hooks.preferences.mockReturnValue(
      loaded(
        preferences(
          [
            row({
              organizationId: ORG,
              categoryCode: 'backups',
              channelId: CHANNEL,
              level: 'none',
            }),
          ],
          { inbox: ON_HERE }
        )
      )
    )
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(
      screen.getByRole('button', { name: 'Remove Work Email: Off, Backups only' })
    ).toBeTruthy()
  })

  it('points at the settings for every organization when one of those decides a category', () => {
    hooks.preferences.mockReturnValue(
      loaded(
        preferences(
          [
            row({ kind: 'email', level: 'all' }),
            row({ categoryCode: 'servers', kind: 'email', level: 'none' }),
          ],
          { email: { level: 'all', source: 'global', sourceId: 'r' } }
        )
      )
    )
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(
      screen.getByText('In effect: Bell: Off · Email: Off (Effective from Every Organization)')
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open the Settings for Every Organization' })
    )
    expect(hooks.push).toHaveBeenCalledWith('/account/notifications')
  })

  it('lists a setting for one event, which no picker shows', () => {
    const topic = row({ organizationId: ORG, topicCode: 'server.offline', kind: 'email' })
    hooks.preferences.mockReturnValue(loaded(preferences([topic], { inbox: ON_HERE })))
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByText('Other Settings Here')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove A server went offline · Email: All' })
    )
    expect(hooks.remove).toHaveBeenCalledWith({ id: topic.id, organizationId: ORG })
  })

  it('says where each level comes from, in the picker label too', () => {
    hooks.preferences.mockReturnValue(
      loaded(
        preferences([], {
          inbox: ON_HERE,
          email: { level: 'critical', source: 'global', sourceId: 'r' },
        })
      )
    )
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByRole('radiogroup', { name: 'Bell level, Set here' })).toBeTruthy()
    expect(
      screen.getByRole('radiogroup', { name: 'Email level, Effective from Every Organization' })
    ).toBeTruthy()
    expect(screen.getByText(/applies only to events that name that project/)).toBeTruthy()
  })

  it('says nothing is turned on only when the person has chosen nothing', () => {
    hooks.preferences.mockReturnValue(loaded(preferences([])))
    const { unmount } = render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByRole('status', { name: 'Nothing is turned on' })).toBeTruthy()
    unmount()

    // A deliberate Nothing preset is a choice.
    const off = { level: 'none', source: 'organization', sourceId: 'r' } as const
    hooks.preferences.mockReturnValue(
      loaded(
        preferences(
          [
            row({ organizationId: ORG, kind: 'inbox', level: 'none' }),
            row({ organizationId: ORG, kind: 'email', level: 'none' }),
          ],
          { inbox: off, email: off }
        )
      )
    )
    const second = render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.queryByRole('status', { name: 'Nothing is turned on' })).toBeNull()
    second.unmount()

    // Only a server is on: something does reach the person.
    hooks.preferences.mockReturnValue(
      loaded(preferences([row({ organizationId: ORG, serverId: SERVER, kind: 'inbox' })]))
    )
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.queryByRole('status', { name: 'Nothing is turned on' })).toBeNull()
  })

  it('a project card lists an unsubscribe for that project without being opened', () => {
    const inProject = row({
      organizationId: ORG,
      projectId: PROJECT,
      categoryCode: 'servers',
      kind: 'email',
      level: 'none',
    })
    hooks.preferences.mockReturnValue(loaded(preferences([inProject], { inbox: ON_HERE })))
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByText('Project Checkout')).toBeTruthy()
    expect(screen.getAllByText('Servers · Email: Off').length).toBeGreaterThan(0)
    // Closed: the card has read no levels.
    expect(hooks.effective).toHaveBeenCalledWith(
      { organizationId: ORG, projectId: PROJECT },
      { enabled: false }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Servers · Email: Off' }))
    expect(hooks.remove).toHaveBeenCalledWith({ id: inProject.id, organizationId: ORG })
  })

  it('Reset All is one action, and a failure is said next to it', async () => {
    const rows = [
      row({ organizationId: ORG, serverId: SERVER, kind: 'inbox' }),
      row({ organizationId: ORG, serverId: SERVER, kind: 'email', level: 'none' }),
    ]
    hooks.preferences.mockReturnValue(loaded(preferences(rows, { inbox: ON_HERE })))
    hooks.removeMany.mockResolvedValue(SAVE_FAILED)
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByText('Bell: All · Email: Off')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset every setting for Server db-1' }))
    expect(hooks.removeMany).toHaveBeenCalledTimes(1)
    expect(hooks.removeMany).toHaveBeenCalledWith({
      ids: rows.map((r) => r.id),
      organizationId: ORG,
    })
    expect(hooks.remove).not.toHaveBeenCalled()
    expect(await screen.findByText('Not every setting could be reset. Try again.')).toBeTruthy()
  })

  it('does not call a project deleted while the lists are still loading', () => {
    const gone = row({ organizationId: ORG, projectId: 'p-unknown', kind: 'inbox' })
    hooks.preferences.mockReturnValue(loaded(preferences([gone], { inbox: ON_HERE })))
    hooks.projects.mockReturnValue(LOADING)
    const { unmount } = render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.queryByText(/deleted or not visible/)).toBeNull()
    expect(screen.getByText('Project')).toBeTruthy()
    unmount()
    hooks.projects.mockReturnValue(loaded({ projects: [] }))
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    expect(screen.getByText('Project (deleted or not visible to you)')).toBeTruthy()
  })

  it('an open card says when its levels could not be read', () => {
    const inProject = row({ organizationId: ORG, projectId: PROJECT, kind: 'inbox' })
    hooks.preferences.mockReturnValue(loaded(preferences([inProject], { inbox: ON_HERE })))
    hooks.effective.mockReturnValue(failed('x failed: HTTP 503'))
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show the levels for Project Checkout' }))
    expect(screen.getByText(/Could not load the levels/)).toBeTruthy()
  })

  it('says a failed read, and hints at an older control plane on a 404', () => {
    hooks.preferences.mockReturnValue(failed('/notification-preferences failed: HTTP 404'))
    render(<OrganizationNotificationPreferences orgId={ORG} />)
    const notice = screen.getByRole('status', {
      name: 'Could not load your notification settings',
    })
    expect(notice.textContent).toMatch(/may be older than this web interface/)
  })
})

describe('Account > Notifications', () => {
  it('names the top scope Every Organization and reports a failed switch beside it', async () => {
    hooks.preferences.mockReturnValue(
      loaded(preferences([], {}, { administrator: true, allOrganizations: false }))
    )
    hooks.settings.mockResolvedValue(SAVE_FAILED)
    render(<GlobalNotificationPreferences />)
    expect(screen.getByRole('region', { name: 'Every Organization' })).toBeTruthy()
    expect(
      screen.getByRole('status', { name: 'No levels are set for every organization' })
    ).toBeTruthy()
    const row = screen.getByRole('group', { name: 'Hear Every Organization' })
    fireEvent.click(within(row).getByRole('switch', { name: 'Hear Every Organization' }))
    expect(hooks.settings).toHaveBeenCalledWith(true)
    expect(await screen.findByText('The setting could not be saved. Try again.')).toBeTruthy()
  })

  it('an older control plane is said in words, not as an empty list', () => {
    const absent = failed('/api/client/v1/notification-preferences failed: HTTP 404')
    hooks.preferences.mockReturnValue(absent)
    render(
      <>
        <GlobalNotificationPreferences />
        <NotificationOverridesList />
      </>
    )
    expect(
      screen.getAllByRole('status', {
        name: 'This control plane has no notification settings yet',
      })
    ).toHaveLength(2)
    expect(screen.queryByText('You have not set anything yet.')).toBeNull()
  })

  it('the override list keeps what loaded and says the rest is missing', () => {
    hooks.organizations.mockReturnValue(
      loaded({
        organizations: [
          { id: ORG, name: 'Acme' },
          { id: OTHER, name: 'Birch' },
        ],
      })
    )
    hooks.preferences.mockReturnValue(loaded(preferences([row({ kind: 'inbox' })])))
    hooks.forOrganizations.mockReturnValue([
      loaded(preferences([row({ organizationId: ORG, kind: 'email', level: 'critical' })])),
      failed('x failed: HTTP 503'),
    ])
    render(<NotificationOverridesList />)
    expect(
      screen.getByRole('status', { name: 'Could not load your notification settings' })
    ).toBeTruthy()
    expect(screen.getByText('The list below may be incomplete.')).toBeTruthy()
    expect(screen.getByText('Every Organization: All')).toBeTruthy()
    expect(screen.getByText('Whole Organization: Critical Only')).toBeTruthy()
  })

  it('the override list is empty in words only when every read worked', () => {
    hooks.preferences.mockReturnValue(loaded(preferences([])))
    const { unmount } = render(<NotificationOverridesList />)
    expect(screen.getByText('You have not set anything yet.')).toBeTruthy()
    unmount()
    hooks.preferences.mockReturnValue(LOADING)
    render(<NotificationOverridesList />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText('You have not set anything yet.')).toBeNull()
  })

  it('names the project and server of an override, reading names only where rows need them', () => {
    hooks.organizations.mockReturnValue(
      loaded({
        organizations: [
          { id: ORG, name: 'Acme' },
          { id: OTHER, name: 'Birch' },
        ],
      })
    )
    hooks.preferences.mockReturnValue(loaded(preferences([])))
    const inProject = row({ organizationId: ORG, projectId: PROJECT, kind: 'email', level: 'none' })
    const onServer = row({ organizationId: ORG, serverId: SERVER, kind: 'inbox' })
    hooks.forOrganizations.mockReturnValue([
      loaded(preferences([inProject, onServer])),
      loaded(preferences([row({ organizationId: OTHER, kind: 'inbox' })])),
    ])
    hooks.scopeNames.mockImplementation((organizationId: string) =>
      loaded(
        organizationId === ORG
          ? {
              projects: new Map([[PROJECT, 'Checkout']]),
              environments: new Map(),
              servers: new Map([[SERVER, 'db-1']]),
            }
          : undefined
      )
    )
    render(<NotificationOverridesList />)
    expect(screen.getByText('Project Checkout: Off')).toBeTruthy()
    expect(screen.getByText('Server db-1: All')).toBeTruthy()
    expect(hooks.scopeNames).toHaveBeenCalledWith(ORG, { enabled: true })
    expect(hooks.scopeNames).toHaveBeenCalledWith(OTHER, { enabled: false })

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Project Checkout: Off, Everything · Email' })
    )
    expect(hooks.remove).toHaveBeenCalledWith({ id: inProject.id, organizationId: ORG })
    fireEvent.click(screen.getByRole('button', { name: 'Open the notification settings of Acme' }))
    expect(hooks.push).toHaveBeenCalledWith(`/${ORG}/manage?tab=notifications`)
  })
})
