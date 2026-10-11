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
  hostings: {} as Record<string, readonly { name: string | null }[]>,
  services: [] as { id: string }[],
  deployments: undefined as undefined | readonly Record<string, unknown>[],
  deploymentsLoading: false,
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

vi.mock('@/components/header-chevron', () => ({ BreadcrumbChevron: () => null }))
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
    tabs: readonly { key: string; label: string }[]
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
    toneLabel: 'Running',
    statusLabel: 'Running',
    toneColor: '#0f0',
  }),
}))
vi.mock('@/components/org/project/project-scope-picker', () => ({
  ProjectScopePicker: ({
    options,
    onSelect,
  }: Readonly<{
    options: readonly { environmentId: string; label: string }[]
    onSelect: (option: { environmentId: string; label: string }) => void
  }>) => (
    <div data-testid="picker">
      {options.map((option) => (
        <button key={option.environmentId} type="button" onClick={() => onSelect(option)}>
          {`Switch to ${option.label}`}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
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


const COMPOSE = { id: 'p', name: 'Shop', metadata: { type: 'docker-compose' } }
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
      </EnvironmentShell>,
    )
    expect(screen.getByTestId('actions')).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByText('page body')).toBeTruthy()
  })

  it.each([
    ['a managed project', { project: { id: 'p', metadata: { type: 'managed', code: 'postgres' } } }],
    ['a platform project', { isSystemProject: true }],
    ['a project still being set up', { needsSetup: true }],
    ['a create-wizard draft', { draft: {} }],
    ['no project yet', { project: null }],
  ])('passes %s straight through', (_label, overrides) => {
    setContext(overrides)
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>,
    )
    expect(screen.getByText('page body')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByTestId('actions')).toBeNull()
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
      </EnvironmentShell>,
    )
    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe(
      '/o/projects/p/overview',
    )
  })

  it('shows no tabs while the path names no environment', () => {
    setContext({ pathEnvironmentId: null })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>,
    )
    expect(screen.getByText('page body')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('waits for environments to load before deciding one is gone', () => {
    setContext({ pathEnvironmentId: 'gone', loading: true })
    render(
      <EnvironmentShell>
        <p>page body</p>
      </EnvironmentShell>,
    )
    expect(screen.queryByTestId('redirect')).toBeNull()
  })
})

describe('environment header', () => {
  it('shows the same four tabs on every tab, lighting the one in view', () => {
    for (const [pathname, active] of [
      ['/o/projects/p/environments/e', 'Overview'],
      ['/o/projects/p/environments/e/deployments', 'Deployments'],
      ['/o/projects/p/environments/e/configuration/hosting', 'Configuration'],
      ['/o/projects/p/environments/e/settings', 'Settings'],
    ] as const) {
      state.pathname = pathname
      render(
        <EnvironmentShell>
          <p>body</p>
        </EnvironmentShell>,
      )
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Overview',
        'Deployments',
        'Configuration',
        'Settings',
      ])
      expect(
        tabs
          .filter((tab) => tab.getAttribute('aria-selected') === 'true')
          .map((tab) => tab.textContent),
      ).toEqual([active])
      fireEvent.click(tabs[1] as HTMLElement)
      expect(state.push).toHaveBeenLastCalledWith(
        '/o/projects/p/environments/e/deployments',
      )
      cleanup()
    }
  })

  it('names the environment, links back to all environments, and shows what is running', () => {
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(screen.getByRole('heading').textContent).toBe('Production')
    expect(screen.getByRole('link', { name: 'All environments' })).toBeTruthy()
    expect(screen.getByLabelText('Running now: Running')).toBeTruthy()
    // No history yet loaded as rows: the last deploy reads Never.
    state.deployments = []
    cleanup()
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(screen.getByLabelText('Last deploy: Never')).toBeTruthy()
  })

  it('leaves the last deploy out while history is loading', () => {
    state.deploymentsLoading = true
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(screen.queryByLabelText(/^Last deploy/)).toBeNull()
  })

  it('shows the site link and opens it', () => {
    state.services = [{ id: 's1' }]
    state.hostings = { s1: [{ name: 'shop.example.com' }] }
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Open shop.example.com' }))
    expect(state.openURL).toHaveBeenCalledWith('https://shop.example.com')
  })

  it('shows no site link when no hostname is set', () => {
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(screen.queryByRole('link', { name: /^Open / })).toBeNull()
  })

  it('swaps the heading for a picker with several environments and keeps the tab on switch', () => {
    setContext({ environments: ENVS })
    state.pathname = '/o/projects/p/environments/e/deployments'
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(screen.queryByRole('heading')).toBeNull()
    fireEvent.click(screen.getByText('Switch to Staging'))
    expect(state.push).toHaveBeenCalledWith(
      '/o/projects/p/environments/e2/deployments',
    )
  })

  it('moves a ?hostingId= deep link to the Hosting lens', () => {
    state.params = { hostingId: 'h9' }
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(state.replace).toHaveBeenCalledWith(
      '/o/projects/p/environments/e/configuration/hosting?hostingId=h9',
    )
  })

  it('leaves the Hosting lens alone when it is already there', () => {
    state.params = { hostingId: 'h9' }
    state.pathname = '/o/projects/p/environments/e/configuration/hosting'
    render(
      <EnvironmentShell>
        <p>body</p>
      </EnvironmentShell>,
    )
    expect(state.replace).not.toHaveBeenCalled()
  })
})
