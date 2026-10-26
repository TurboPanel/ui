// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentShell, useEnvironmentChrome } from './environment-shell'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  pathname: '/o/projects/p/environments/e',
  params: {} as Record<string, string | string[] | undefined>,
  hostings: {} as Record<
    string,
    readonly { createdAt: string; options: { hostnames: string[]; bind?: string } }[]
  >,
  width: 1200,
  services: [] as { id: string }[],
  deployments: undefined as undefined | readonly Record<string, unknown>[],
  deploymentsLoading: false,
  toneLabel: 'Running',
  views: {} as Record<string, unknown>,
  replace: vi.fn(),
  push: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
  View: ({ children, accessibilityLabel }: Props) => (
    <div aria-label={accessibilityLabel as string}>{children}</div>
  ),
  Text: ({ children, accessibilityRole }: Props) => (
    <span role={accessibilityRole === 'header' ? 'heading' : undefined}>{children}</span>
  ),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole }: Props) => (
    <button
      type="button"
      role={accessibilityRole === 'link' ? 'link' : undefined}
      aria-label={accessibilityLabel as string}
      onClick={onPress as () => void}
    >
      {children}
    </button>
  ),
  Modal: ({ visible, children }: Props) => (visible ? <div role="dialog">{children}</div> : null),
  useWindowDimensions: () => ({ width: state.width, height: 800 }),
  Linking: { openURL: state.openURL },
}))

vi.mock('expo-router', () => ({
  Link: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
  Redirect: ({ href }: Readonly<{ href: string }>) => (
    <div data-testid="redirect" data-href={href} />
  ),
  useLocalSearchParams: () => state.params,
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace, push: state.push }),
}))

vi.mock('@/components/header-chevron', () => ({
  BreadcrumbChevron: () => null,
  HeaderChevron: () => null,
}))
vi.mock('@/components/ui/v4/use-palette', () => ({ useTouch: () => false }))
vi.mock('@/components/ui', () => ({
  StatusDot: ({ color }: Readonly<{ color: string }>) => <i data-color={color} />,
}))
vi.mock('@/components/ui/v4', () => ({
  UnderlineTabs: ({
    tabs,
    value,
    onChange,
    ariaLabel,
  }: Readonly<{
    tabs: readonly { key: string; label: string; muted?: boolean; mutedLabel?: string }[]
    value: string
    onChange: (key: string) => void
    ariaLabel: string
  }>) => (
    <div role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          data-muted={tab.muted ? tab.mutedLabel : undefined}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/org/project-settings-area', () => ({
  readHostingIdParam: (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null,
}))
vi.mock('@/components/org/project/overview-environments-panel', () => ({
  EnvironmentLifecycleProvider: ({ children }: Props) => <>{children}</>,
  EnvironmentLifecycleActions: () => <div data-testid="actions" />,
  EnvironmentLifecycleNotices: () => <div data-testid="notices" />,
  useEnvironmentLifecycle: () => ({
    toneLabel: state.toneLabel,
    statusLabel: 'Running',
    toneColor: '#0f0',
  }),
}))
vi.mock('@/components/org/project/project-scope-picker', () => ({
  ProjectScopePicker: ({
    options,
    onSelect,
    allLink,
  }: Readonly<{
    options: readonly { environmentId: string; label: string }[]
    onSelect: (option: { environmentId: string; label: string }) => void
    allLink?: { label: string; onPress: () => void }
  }>) => (
    <div data-testid="picker">
      {allLink ? (
        <a href="#all" onClick={allLink.onPress}>
          {allLink.label}
        </a>
      ) : null}
      {options.map((option) => (
        <button key={option.environmentId} type="button" onClick={() => onSelect(option)}>
          {`Switch to ${option.label}`}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/org/managed/managed-environment-shell', () => ({
  ManagedEnvironmentProvider: ({ children }: Props) => <>{children}</>,
  ManagedEnvironmentHeader: () => <div data-testid="managed-header" />,
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useEnvironmentConfigViews: () => ({ views: state.views, isLoading: false }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServices: () => ({ data: { services: state.services } }),
  useHostingsByServices: () => ({ hostingsByService: state.hostings }),
}))
vi.mock('@/lib/queries/execution-logs', () => ({
  useEnvironmentDeployments: () => ({
    isLoading: state.deploymentsLoading,
    data: state.deployments ? { deployments: state.deployments } : undefined,
  }),
}))

const COMPOSE = { id: 'p', name: 'Shop', kind: 'compose' }
const ENVS = [
  { id: 'e', name: 'Production' },
  { id: 'e2', name: 'Staging' },
]

function setContext(overrides: Record<string, unknown> = {}) {
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: COMPOSE,
    environments: [ENVS[0]],
    selectedEnvironment: ENVS[0],
    pathEnvironmentId: 'e',
    loading: false,
    isSystemProject: false,
    draft: null,
    needsSetup: false,
    ...overrides,
  }
}

function ChromeProbe() {
  return <span>{useEnvironmentChrome() ? 'chrome' : 'plain'}</span>
}

beforeEach(() => {
  state.pathname = '/o/projects/p/environments/e'
  state.params = {}
  state.hostings = {}
  state.services = []
  state.deployments = undefined
  state.deploymentsLoading = false
  state.toneLabel = 'Running'
  state.views = {}
  state.width = 1200
  state.replace.mockClear()
  state.push.mockClear()
  state.openURL.mockClear()
  setContext()
})
afterEach(cleanup)

describe('EnvironmentShell gating', () => {
  it('wraps Compose projects with the header and tabs', () => {
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.getByTestId('actions')).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByText('page body')).toBeTruthy()
  })

  it.each([
    ['a platform project', { isSystemProject: true }],
    ['a project still being set up', { needsSetup: true }],
    ['a create-wizard draft', { draft: {} }],
    ['no project yet', { project: null }],
  ])('passes %s straight through', (_label, overrides) => {
    setContext(overrides)
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.getByText('page body')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByTestId('actions')).toBeNull()
  })

  it('gives a managed database the same tab bar, its own header and Compose greyed', () => {
    setContext({ project: { id: 'p', kind: 'managed', metadata: { code: 'postgres' } } })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.getByTestId('managed-header')).toBeTruthy()
    expect(screen.queryByTestId('actions')).toBeNull()
    expect(screen.queryByTestId('notices')).toBeNull()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Deployments',
      'Services',
      'Compose',
      'Bindings',
      'Hosting',
      'Settings',
    ])
    const compose = screen.getByRole('tab', { name: 'Compose' })
    expect(compose.getAttribute('data-muted')).toBe('Managed by TurboPanel')
    expect(tabs.filter((tab) => tab.getAttribute('data-muted'))).toHaveLength(1)
    // A greyed tab still opens: never a dead link.
    fireEvent.click(compose)
    expect(state.push).toHaveBeenCalledWith('/o/projects/p/environments/e/configuration/compose')
    expect(screen.getByText('page body')).toBeTruthy()
  })

  it('reports whether a route gets the header', () => {
    render(<ChromeProbe />)
    expect(screen.getByText('chrome')).toBeTruthy()
    cleanup()
    setContext({ isSystemProject: true })
    render(<ChromeProbe />)
    expect(screen.getByText('plain')).toBeTruthy()
  })

  it('goes back to the project when the path names an environment that is gone', () => {
    setContext({ pathEnvironmentId: 'gone' })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe('/o/projects/p/overview')
  })

  it('shows no tabs while the path names no environment', () => {
    setContext({ pathEnvironmentId: null })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.getByText('page body')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('waits for environments to load before deciding one is gone', () => {
    setContext({ pathEnvironmentId: 'gone', loading: true })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>
    )
    expect(screen.queryByTestId('redirect')).toBeNull()
  })
})

describe('environment header', () => {
  it('shows the same one tab bar on every tab, lighting the one in view', () => {
    for (const [pathname, active] of [
      ['/o/projects/p/environments/e', 'Overview'],
      ['/o/projects/p/environments/e/deployments', 'Deployments'],
      ['/o/projects/p/environments/e/configuration', 'Services'],
      ['/o/projects/p/environments/e/configuration/storage', 'Services'],
      ['/o/projects/p/environments/e/configuration/compose', 'Compose'],
      ['/o/projects/p/environments/e/configuration/bindings', 'Bindings'],
      ['/o/projects/p/environments/e/configuration/hosting', 'Hosting'],
      ['/o/projects/p/environments/e/settings', 'Settings'],
    ] as const) {
      state.pathname = pathname
      render(
        <EnvironmentShell>
          <p>body</p>
        </EnvironmentShell>
      )
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Overview',
        'Deployments',
        'Services',
        'Compose',
        'Bindings',
        'Hosting',
        'Settings',
      ])
      expect(
        tabs
          .filter((tab) => tab.getAttribute('aria-selected') === 'true')
          .map((tab) => tab.textContent)
      ).toEqual([active])
      fireEvent.click(tabs[1] as HTMLElement)
      expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/environments/e/deployments')
      fireEvent.click(tabs[5] as HTMLElement)
      expect(state.push).toHaveBeenLastCalledWith(
        '/o/projects/p/environments/e/configuration/hosting'
      )
      cleanup()
    }
  })

  it('names the environment in the picker, which leads back to all environments, and shows what is running', () => {
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.getByText('Switch to Production')).toBeTruthy()
    // The old "All environments ›" crumb above the header is now in the picker.
    expect(screen.queryByLabelText('Breadcrumb')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'All environments' }))
    expect(state.push).toHaveBeenCalledWith('/o/projects/p/overview')
    expect(screen.getByLabelText('Running now: Running')).toBeTruthy()
    // No history yet loaded as rows: the last deploy reads Never.
    state.deployments = []
    cleanup()
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.getByLabelText('Last deploy: Never')).toBeTruthy()
  })

  const deployRow = (status: string, generation: number, startedAt: string | null = null) => ({
    id: `c${generation}`,
    commandId: `c${generation}`,
    generation,
    serverId: 'srv',
    status,
    actorEntityType: 'user',
    queuedAt: '2026-10-26T10:00:00Z',
    startedAt,
    durationMs: null,
  })

  function renderNativeApp(deployments: readonly Record<string, unknown>[]) {
    // A native app has no containers, so the lifecycle reads "Not started yet".
    state.toneLabel = 'Not started yet'
    state.views = { e: { effective: { services: [{ kind: 'node' }] } } }
    state.deployments = deployments
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
  }

  it('reads a deploy the server has started as running in the header, not queued', () => {
    renderNativeApp([deployRow('sent', 2, '2026-10-26T10:01:00Z'), deployRow('succeeded', 1)])
    expect(screen.getByLabelText(/^Last deploy: Running/)).toBeTruthy()
    // The release the earlier deploy left is still serving.
    expect(screen.getByLabelText('Running now: Running')).toBeTruthy()
  })

  it('keeps a native app running after its newest deploy timed out', () => {
    renderNativeApp([deployRow('timed_out', 2), deployRow('succeeded', 1)])
    expect(screen.getByLabelText('Running now: Running')).toBeTruthy()
    expect(screen.getByLabelText(/^Last deploy: Timed out/)).toBeTruthy()
  })

  it('says starting for a first deploy that is still queued', () => {
    renderNativeApp([deployRow('queued', 1)])
    expect(screen.getByLabelText('Running now: Starting…')).toBeTruthy()
    expect(screen.getByLabelText(/^Last deploy: Queued/)).toBeTruthy()
  })

  it('leaves the last deploy out while history is loading', () => {
    state.deploymentsLoading = true
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.queryByLabelText(/^Last deploy/)).toBeNull()
  })

  const host = (createdAt: string, hostnames: string[], bind?: string) => ({
    createdAt,
    options: { hostnames, ...(bind ? { bind } : {}) },
  })

  function renderWithHostnames(primaryHostname?: string | null) {
    state.services = [{ id: 's1' }, { id: 's2' }]
    state.hostings = {
      s1: [host('2026-10-02T00:00:00Z', ['new.example.com'])],
      s2: [
        host('2026-10-01T00:00:00Z', ['shop.example.com', '*.shop.example.com']),
        host('2026-09-01T00:00:00Z', ['inside.example.com'], 'local'),
      ],
    }
    const env = { ...ENVS[0], options: primaryHostname === undefined ? null : { primaryHostname } }
    setContext({ environments: [env], selectedEnvironment: env })
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
  }

  it('visits the oldest public hostname when no primary is set', () => {
    renderWithHostnames()
    const visit = screen.getByRole('link', { name: 'Visit shop.example.com' })
    expect(visit.textContent).toBe('Visit shop.example.com ↗')
    fireEvent.click(visit)
    expect(state.openURL).toHaveBeenCalledWith('https://shop.example.com')
  })

  it('visits the primary hostname when one is set', () => {
    renderWithHostnames('new.example.com')
    expect(screen.getByRole('link', { name: 'Visit new.example.com' })).toBeTruthy()
  })

  it('falls back to the oldest hostname when the stored primary is gone', () => {
    renderWithHostnames('removed.example.com')
    expect(screen.getByRole('link', { name: 'Visit shop.example.com' })).toBeTruthy()
  })

  it('lists every public hostname behind the arrow when there are several', () => {
    renderWithHostnames('new.example.com')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Other hostnames' }))
    const menu = screen.getByRole('dialog')
    const rows = Array.from(menu.querySelectorAll('[role="link"]')).map((row) =>
      row.getAttribute('aria-label')
    )
    expect(rows).toEqual(['Visit shop.example.com', 'Visit new.example.com, primary hostname'])
    fireEvent.click(screen.getByRole('link', { name: 'Visit shop.example.com' }))
    expect(state.openURL).toHaveBeenCalledWith('https://shop.example.com')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no arrow with one hostname', () => {
    state.services = [{ id: 's1' }]
    state.hostings = { s1: [host('2026-10-01T00:00:00Z', ['shop.example.com'])] }
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.getByRole('link', { name: 'Visit shop.example.com' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Other hostnames' })).toBeNull()
  })

  it('shortens the label on a phone and keeps the hostname for screen readers', () => {
    state.width = 390
    renderWithHostnames()
    const visit = screen.getByRole('link', { name: 'Visit shop.example.com' })
    expect(visit.textContent).toBe('Visit ↗')
  })

  it('shows no Visit button without a hostname', () => {
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.queryByRole('link', { name: /^Visit / })).toBeNull()
  })

  it('badges the primary environment beside its name', () => {
    const env = { ...ENVS[0], isPrimary: true }
    setContext({ environments: [env], selectedEnvironment: env })
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(screen.getByLabelText('Primary environment').textContent).toBe('Primary')
  })

  it('switches environments from the picker and keeps the tab', () => {
    setContext({ environments: ENVS })
    state.pathname = '/o/projects/p/environments/e/deployments'
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    fireEvent.click(screen.getByText('Switch to Staging'))
    expect(state.push).toHaveBeenCalledWith('/o/projects/p/environments/e2/deployments')
  })

  it('moves a ?hostingId= deep link to the Hosting lens', () => {
    state.params = { hostingId: 'h9' }
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(state.replace).toHaveBeenCalledWith(
      '/o/projects/p/environments/e/configuration/hosting?hostingId=h9'
    )
  })

  it('leaves the Hosting lens alone when it is already there', () => {
    state.params = { hostingId: 'h9' }
    state.pathname = '/o/projects/p/environments/e/configuration/hosting'
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>
    )
    expect(state.replace).not.toHaveBeenCalled()
  })
})
