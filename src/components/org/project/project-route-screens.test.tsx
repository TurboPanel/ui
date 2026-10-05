// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRecord } from '@/lib/instance-api'
import {
  EnvironmentComposeScreen,
  EnvironmentConfigurationTabScreen,
  EnvironmentDeploymentsScreen,
  EnvironmentOverviewScreen,
  EnvironmentSettingsScreen,
  LegacyProjectRedirect,
  ProjectBaseScreen,
  ProjectEnvironmentsScreen,
} from './project-route-screens'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  params: {} as Record<string, string | string[] | undefined>,
  chrome: true,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
  View: ({ children }: Props) => <div>{children}</div>,
}))

vi.mock('expo-router', () => ({
  Redirect: ({ href }: Readonly<{ href: string }>) => (
    <div data-testid="redirect" data-href={href} />
  ),
  useLocalSearchParams: () => state.params,
}))

vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/components/org/project/environment-shell', () => ({
  useEnvironmentChrome: () => state.chrome,
}))
vi.mock('@/components/org/project/managed-focus-tab', () => ({
  ManagedFocusTab: ({ focus }: Readonly<{ focus: string }>) => (
    <div data-testid="managed" data-focus={focus} />
  ),
}))
vi.mock('@/components/org/project/configuration/environment-configuration', () => ({
  EnvironmentConfigurationScreen: () => <div data-testid="configuration" />,
}))
vi.mock('@/components/org/project/project-overview-tab', () => ({
  ProjectOverviewTab: () => <div data-testid="compose-surface" />,
}))
vi.mock('@/components/org/project/project-environments-tab', () => ({
  ProjectEnvironmentsTab: () => <div data-testid="environments-tab" />,
}))
vi.mock('@/components/org/project/overview-environments-panel', () => ({
  EnvironmentGitSourceSection: () => <div data-testid="git-source" />,
}))
vi.mock('@/components/org/project/environment-deployment-history-panel', () => ({
  EnvironmentDeploymentHistoryPanel: (props: Props) => (
    <div
      data-testid="history"
      data-environment={props.environmentId as string}
      data-open={String(props.alwaysOpen)}
    />
  ),
}))


function project(metadata: ProjectRecord['metadata']): Partial<ProjectRecord> {
  return { id: 'p', metadata }
}

function setContext(overrides: Record<string, unknown> = {}) {
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: project({ type: 'docker-compose' }),
    isSystemProject: false,
    pathEnvironmentId: 'e',
    ...overrides,
  }
}

const redirectHref = () => screen.getByTestId('redirect').getAttribute('data-href')

beforeEach(() => {
  state.params = { orgId: 'o', projectId: 'p' }
  state.chrome = true
  setContext()
})
afterEach(cleanup)

describe('LegacyProjectRedirect', () => {
  it('sends a retired project route to the Base tab and keeps the query', () => {
    state.params = { orgId: 'o', projectId: 'p', hostingId: 'h1' }
    render(<LegacyProjectRedirect segment="hosting" />)
    expect(redirectHref()).toBe('/o/projects/p/base/hosting?hostingId=h1')
  })

  it('sends a retired environment route to Configuration and keeps the query', () => {
    state.params = { orgId: 'o', projectId: 'p', environmentId: 'e', hostingId: 'h1' }
    render(<LegacyProjectRedirect segment="hosting" />)
    expect(redirectHref()).toBe(
      '/o/projects/p/environments/e/configuration/hosting?hostingId=h1',
    )
  })

  it('sends the retired map routes to the Environments tab and the Overview tab', () => {
    render(<LegacyProjectRedirect segment="map" />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    state.params = { orgId: 'o', projectId: 'p', environmentId: 'e' }
    render(<LegacyProjectRedirect segment="map" />)
    expect(redirectHref()).toBe('/o/projects/p/environments/e')
  })

  it('reads an array-valued environment id', () => {
    state.params = { orgId: 'o', projectId: 'p', environmentId: ['e', 'x'] }
    render(<LegacyProjectRedirect segment="services" />)
    expect(redirectHref()).toBe('/o/projects/p/environments/e/configuration')
  })

  it('opens the project for a platform project, at either scope', () => {
    setContext({ isSystemProject: true })
    render(<LegacyProjectRedirect segment="compose" />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    state.params = { orgId: 'o', projectId: 'p', environmentId: 'e' }
    render(<LegacyProjectRedirect segment="compose" />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
  })

  it('opens a managed project at its overview, and keeps its environment page', () => {
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<LegacyProjectRedirect segment="storage" />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    state.params = { orgId: 'o', projectId: 'p', environmentId: 'e' }
    render(<LegacyProjectRedirect segment="storage" />)
    expect(screen.getByTestId('managed').getAttribute('data-focus')).toBe('overview')
  })

  it('falls back to the project for a segment that was never retired', () => {
    render(<LegacyProjectRedirect segment={'nope' as 'compose'} />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
  })
})

describe('project tabs', () => {
  it('shows the Environments tab for a Compose project', () => {
    render(<ProjectEnvironmentsScreen />)
    expect(screen.getByTestId('environments-tab')).toBeTruthy()
  })

  it('keeps the platform component panel and the managed overview', () => {
    setContext({ isSystemProject: true })
    render(<ProjectEnvironmentsScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<ProjectEnvironmentsScreen />)
    expect(screen.getByTestId('managed')).toBeTruthy()
  })

  it('shows the compose surface on Base, and sends platform and managed projects home', () => {
    render(<ProjectBaseScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    cleanup()
    setContext({ isSystemProject: true })
    render(<ProjectBaseScreen />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<ProjectBaseScreen />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
  })
})

describe('environment tabs', () => {
  it('renders the environment Overview for Compose and platform projects, managed focus otherwise', () => {
    render(<EnvironmentOverviewScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    cleanup()
    setContext({ isSystemProject: true })
    render(<EnvironmentOverviewScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<EnvironmentOverviewScreen />)
    expect(screen.getByTestId('managed')).toBeTruthy()
  })

  it('renders Configuration for Compose, home for platform, managed focus for managed', () => {
    render(<EnvironmentComposeScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    cleanup()
    setContext({ isSystemProject: true })
    render(<EnvironmentComposeScreen />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<EnvironmentComposeScreen />)
    expect(screen.getByTestId('managed')).toBeTruthy()
  })

  it('renders the Configuration tab for Compose, home for platform, managed focus for managed', () => {
    render(<EnvironmentConfigurationTabScreen />)
    expect(screen.getByTestId('configuration')).toBeTruthy()
    cleanup()
    setContext({ isSystemProject: true })
    render(<EnvironmentConfigurationTabScreen />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<EnvironmentConfigurationTabScreen />)
    expect(screen.getByTestId('managed')).toBeTruthy()
  })

  it('adds branch and deploy-on-push to Settings only where the environment header exists', () => {
    render(<EnvironmentSettingsScreen />)
    expect(screen.getByTestId('compose-surface')).toBeTruthy()
    expect(screen.getByTestId('git-source')).toBeTruthy()
    cleanup()
    state.chrome = false
    render(<EnvironmentSettingsScreen />)
    expect(screen.queryByTestId('git-source')).toBeNull()
  })

  it('opens the deploy history, fully open, for the environment in the path', () => {
    render(<EnvironmentDeploymentsScreen />)
    const history = screen.getByTestId('history')
    expect(history.getAttribute('data-environment')).toBe('e')
    expect(history.getAttribute('data-open')).toBe('true')
  })

  it('has no history without an environment, and sends platform and managed projects away', () => {
    setContext({ pathEnvironmentId: null })
    const { container } = render(<EnvironmentDeploymentsScreen />)
    expect(container.innerHTML).toBe('')
    cleanup()
    setContext({ isSystemProject: true })
    render(<EnvironmentDeploymentsScreen />)
    expect(redirectHref()).toBe('/o/projects/p/overview')
    cleanup()
    setContext({ project: project({ type: 'managed', code: 'postgres' }) })
    render(<EnvironmentDeploymentsScreen />)
    expect(screen.getByTestId('managed')).toBeTruthy()
  })
})
