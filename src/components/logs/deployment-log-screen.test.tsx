// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeploymentLogScreen } from './deployment-log-screen'
import { EnvironmentShell } from '@/components/org/project/environment-shell'
import { ProjectProvider } from '@/components/org/project/project-context'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  pathname: '/o/projects/p/environments/e/deployments/cmd-1',
  params: {} as Record<string, string | string[] | undefined>,
  redirects: [] as string[],
  environments: [] as Record<string, unknown>[],
  deployments: [] as Record<string, unknown>[],
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
  View: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children, accessibilityRole }: Props) => (
    <span role={accessibilityRole === 'header' ? 'heading' : undefined}>{children}</span>
  ),
  Pressable: ({ children, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {children}
    </button>
  ),
  useWindowDimensions: () => ({ width: 1200, height: 800 }),
  Linking: { openURL: () => Promise.resolve() },
}))

vi.mock('expo-router', () => ({
  Link: ({ children }: Props) => <>{children}</>,
  Redirect: ({ href }: Readonly<{ href: string }>) => {
    state.redirects.push(href)
    return <div data-testid="redirect" data-href={href} />
  },
  useLocalSearchParams: () => state.params,
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/query-client')>()),
  useCan: () => true,
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const later = <T,>(value: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value()), 5))
  return {
    ...(await importOriginal<typeof import('@/lib/instance-api')>()),
    fetchProject: () =>
      later(() => ({
        project: { id: 'p', name: 'Shop', kind: 'compose', workspaceId: 'w', options: {} },
      })),
    fetchVisibleEnvironments: () => later(() => ({ environments: state.environments })),
    fetchVisibleWorkspaces: () =>
      later(() => ({ workspaces: [{ id: 'w', name: 'Mine', kind: 'user' }] })),
    fetchEnvironmentDeployments: () =>
      later(() => ({ deployments: state.deployments, nextCursor: null })),
  }
})

vi.mock('@/lib/recent-projects', () => ({ recordProjectTouch: () => undefined }))
vi.mock('@/components/org/project/compose-draft-context', () => ({
  ComposeDraftProvider: ({ children }: Props) => <>{children}</>,
}))
vi.mock('@/components/header-chevron', () => ({
  BreadcrumbChevron: () => null,
  HeaderChevron: () => null,
}))
vi.mock('@/components/ui', () => ({
  EmptyState: ({ title }: Readonly<{ title: string }>) => <p>{title}</p>,
  LoadingState: ({ label }: Readonly<{ label: string }>) => <p>{label}</p>,
  SegmentedControl: () => null,
  StatusDot: () => null,
}))
vi.mock('@/components/ui/v4', () => ({ UnderlineTabs: () => null }))
vi.mock('@/components/org/project-settings-area', () => ({
  readHostingIdParam: () => null,
}))
vi.mock('@/components/org/project/overview-environments-panel', () => ({
  EnvironmentLifecycleProvider: ({ children }: Props) => <>{children}</>,
  EnvironmentLifecycleActions: () => null,
  EnvironmentLifecycleNotices: () => null,
  useEnvironmentLifecycle: () => ({ toneLabel: 'Running', statusLabel: 'Running' }),
}))
vi.mock('@/components/org/project/environment-header-parts', () => ({
  EnvironmentHeaderFrame: () => null,
  EnvironmentTitle: () => null,
  EnvironmentBadge: () => null,
}))
vi.mock('@/components/org/project/visit-site-button', () => ({ VisitSiteButton: () => null }))
vi.mock('@/components/org/managed/managed-environment-shell', () => ({
  ManagedEnvironmentProvider: ({ children }: Props) => <>{children}</>,
  ManagedEnvironmentHeader: () => null,
}))
vi.mock('@/components/org/project/managed-focus-tab', () => ({ ManagedFocusTab: () => null }))
vi.mock('@/components/org/project/environment-deployment-history-panel', () => ({
  RunningDeployNotice: () => null,
}))
vi.mock('@/components/logs/log-viewer', () => ({
  LogViewer: () => <div data-testid="log" />,
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useEnvironmentConfigViews: () => ({ views: {}, isLoading: false }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServices: () => ({ data: { services: [] } }),
  useHostingsByServices: () => ({ hostingsByService: {} }),
}))
vi.mock('@/lib/queries/commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/commands')>()),
  useCommandsBatch: () => ({ data: undefined }),
}))
vi.mock('@/lib/queries/execution-logs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/execution-logs')>()),
  useCommandLog: () => ({ snapshot: { lines: [], sealed: true }, state: 'ready' }),
}))

const DEPLOY = {
  id: 'h1',
  commandId: 'cmd-1',
  generation: 1,
  serverId: 's1',
  serverName: 'web-1',
  status: 'succeeded',
  hasLog: true,
  startedAt: '2026-10-27T10:00:00.000Z',
  finishedAt: '2026-10-27T10:01:00.000Z',
  createdAt: '2026-10-27T10:00:00.000Z',
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** A fresh page load: an empty cache, every read in flight. */
function coldDeployLink(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider orgId="o" projectId="p">
        <EnvironmentShell>
          <DeploymentLogScreen />
        </EnvironmentShell>
      </ProjectProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  state.pathname = '/o/projects/p/environments/e/deployments/cmd-1'
  state.params = { orgId: 'o', projectId: 'p', environmentId: 'e', deploymentId: 'cmd-1' }
  state.redirects = []
  state.environments = [{ id: 'e', name: 'Production', projectId: 'p', options: {} }]
  state.deployments = [DEPLOY]
})

afterEach(() => {
  cleanup()
})

describe('DeploymentLogScreen on a direct link', () => {
  it('stays on the deploy once everything has loaded', async () => {
    render(coldDeployLink(newClient()))
    expect(await screen.findByTestId('log')).toBeTruthy()
    expect(state.redirects).toEqual([])
  })

  it('waits for the path when the router still reports the project path on the first render', async () => {
    // A fresh load passes through `/o/projects/p?environmentId=e&deploymentId=cmd-1`
    // while the project layout waits for its data; the screen's first render
    // can still read that path before the router catches up.
    const client = newClient()
    state.pathname = '/o/projects/p'
    const view = render(coldDeployLink(client))
    await waitFor(() => expect(client.isFetching()).toBe(0))
    state.pathname = '/o/projects/p/environments/e/deployments/cmd-1'
    view.rerender(coldDeployLink(client))
    expect(await screen.findByTestId('log')).toBeTruthy()
    expect(state.redirects).toEqual([])
  })

  it('says the deploy is not found when the history does not have it', async () => {
    state.deployments = []
    render(coldDeployLink(newClient()))
    expect(await screen.findByText('Deploy not found')).toBeTruthy()
    expect(state.redirects).toEqual([])
  })
})
