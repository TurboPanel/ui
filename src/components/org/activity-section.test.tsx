// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationActivityItem } from '@/lib/instance-api'
import { ActivitySection } from './activity-section'

type Option = { value: string | null; label: string }

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  hasMore: false,
  total: null as number | null,
  canManage: true,
  feedParams: [] as unknown[],
}))

/**
 * Mirrors expo-router inside the org tab pager: the section sits in the
 * `[orgId]` layout, so its local params only ever hold `orgId`; the Activity
 * route's query is visible only through the global params.
 */
const router = vi.hoisted(() => ({
  push: vi.fn(),
  setParams: vi.fn(),
  params: {} as Record<string, string>,
  pathname: '/o1/activity',
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => ({ orgId: 'o1' }),
  useGlobalSearchParams: () => ({ orgId: 'o1', ...router.params }),
  usePathname: () => router.pathname,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/pull-to-refresh', () => ({ usePullToRefresh: () => undefined }))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canManage }))
vi.mock('@/lib/queries/activity', () => ({
  ACTIVITY_PAGE_SIZE: 25,
  useOrganizationActivity: (_orgId: string, params: unknown, options: unknown) => {
    state.feedParams.push({ params, options })
    return {
      data: {
        items: state.items,
        total: state.total ?? state.items.length,
        hasMore: state.hasMore,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
}))
vi.mock('@/lib/queries/projects', () => ({
  useProjects: () => ({ data: { projects: [{ id: PROJECT, name: 'My App' }] } }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: () => ({ data: { environments: [{ id: ENV, name: 'Production' }] } }),
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  DataTable: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DataTableCell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DataTableRow: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  SectionPanel: ({ children, hint }: { children: unknown; hint?: string }) => (
    <section>
      {hint ? <p>{hint}</p> : null}
      {children as never}
    </section>
  ),
  SegmentedControl: (props: { options: readonly Option[]; onChange: (v: string) => void }) => (
    <div>
      {props.options.map((option) => (
        <button key={option.label} type="button" onClick={() => props.onChange(option.value!)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
  Select: (props: {
    options: readonly Option[]
    noneLabel?: string
    accessibilityLabel: string
    onChange: (value: string | null) => void
  }) => (
    <div aria-label={props.accessibilityLabel}>
      {props.noneLabel ? (
        <button type="button" onClick={() => props.onChange(null)}>
          {`pick ${props.noneLabel}`}
        </button>
      ) : null}
      {props.options.map((option) => (
        <button key={option.label} type="button" onClick={() => props.onChange(option.value)}>
          {`pick ${option.label}`}
        </button>
      ))}
    </div>
  ),
  TextLink: (props: { label: string; onPress: () => void }) => (
    <button type="button" onClick={props.onPress}>
      {props.label}
    </button>
  ),
}))

const PROJECT = '0192f000-0000-7000-8000-00000000000a'
const ENV = '0192f000-0000-7000-8000-00000000000b'

function item(patch: Partial<OrganizationActivityItem>): OrganizationActivityItem {
  return {
    id: 'c1',
    projectId: 'p1',
    projectName: 'My App',
    environmentId: 'e1',
    environmentName: 'Production',
    serverId: 's1',
    action: 'deploy',
    state: 'deploying',
    startedAt: '2026-10-21T10:00:00Z',
    step: null,
    totalSteps: null,
    durationSecs: 5,
    errorMessage: null,
    crashCount: null,
    ...patch,
  }
}

beforeEach(() => {
  state.items = []
  state.hasMore = false
  state.total = null
  state.canManage = true
  state.feedParams = []
  router.params = {}
  router.pathname = '/o1/activity'
  router.push.mockReset()
  router.setParams.mockReset()
})
afterEach(cleanup)

describe('ActivitySection states', () => {
  it('shows a queued item as Queued with no step progress', () => {
    state.items = [item({ state: 'queued', step: 2, totalSteps: 5 })]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('Queued')).toBeTruthy()
    expect(screen.queryByText('Deploying')).toBeNull()
    expect(screen.getByText('Waiting for the server to start it')).toBeTruthy()
    expect(screen.queryByText(/step 2/i)).toBeNull()
  })

  it('shows a deploying item as Deploying with its step', () => {
    state.items = [item({ state: 'deploying', step: 2, totalSteps: 5 })]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('Deploying')).toBeTruthy()
    expect(screen.queryByText('Queued')).toBeNull()
    expect(screen.getByText(/2 of 5/)).toBeTruthy()
  })

  it('calls a restart that is being worked on Restarting, not Deploying', () => {
    state.items = [item({ action: 'restart', state: 'deploying' })]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('Restarting')).toBeTruthy()
    expect(screen.queryByText('Deploying')).toBeNull()
  })

  it('shows a succeeded deploy with its commit, who started it and a log link', () => {
    state.items = [
      item({
        state: 'succeeded',
        finishedAt: '2026-10-21T10:01:00Z',
        actorType: 'user',
        actorName: 'Ada Lovelace',
        commit: { sha: 'abc1234def', message: 'Fix the login page' },
      }),
    ]
    render(<ActivitySection orgId="o1" />)
    // the badge, next to the filter of the same name
    expect(screen.getAllByText('Succeeded')).toHaveLength(2)
    expect(screen.getByText('abc1234 Fix the login page')).toBeTruthy()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('View Log')).toBeTruthy()
  })

  it('names a push, a rollback, a time-out and a cancel in plain words', () => {
    state.items = [
      item({
        id: 'c1',
        state: 'failed',
        failure: 'rolled_back',
        actorType: 'system',
        trigger: { kind: 'push', branch: 'main', commitSha: 'fff0000', sourceId: null },
        commit: { sha: 'fff0000', message: null },
        errorMessage: 'rolled_back: health check failed',
      }),
      item({ id: 'c2', state: 'failed', failure: 'timed_out' }),
      item({ id: 'c3', state: 'cancelled' }),
    ]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('Rolled Back')).toBeTruthy()
    expect(screen.getByText('Push to main')).toBeTruthy()
    expect(screen.getByText('Timed Out')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
  })

  it('names the git login that pushed, beside the branch', () => {
    state.items = [
      item({
        id: 'c1',
        state: 'succeeded',
        actorType: 'system',
        trigger: {
          kind: 'push',
          branch: 'main',
          commitSha: 'fff0000',
          sourceId: null,
          pushedBy: 'octocat',
        },
      }),
    ]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('octocat (Push to main)')).toBeTruthy()
  })
})

describe('ActivitySection links', () => {
  it('opens the project, the environment and the deploy log', () => {
    state.items = [item({ id: 'cmd-1', state: 'succeeded' })]
    render(<ActivitySection orgId="o1" />)
    fireEvent.click(screen.getByText('My App'))
    expect(router.push).toHaveBeenLastCalledWith('/o1/projects/p1')
    fireEvent.click(screen.getByText('Production'))
    expect(router.push).toHaveBeenLastCalledWith('/o1/projects/p1/environments/e1')
    fireEvent.click(screen.getByText('View Log'))
    expect(router.push).toHaveBeenLastCalledWith(
      '/o1/projects/p1/environments/e1/deployments/cmd-1'
    )
  })

  it('offers no log link for a restart, and plain text for a removed environment', () => {
    state.items = [
      item({ id: 'r1', action: 'restart', state: 'succeeded' }),
      item({ id: 'd2', environmentId: null, environmentName: null, state: 'failed' }),
    ]
    render(<ActivitySection orgId="o1" />)
    expect(screen.queryByText('View Log')).toBeNull()
    expect(screen.getAllByText('My App')).toHaveLength(2)
    expect(screen.getByText('Deleted')).toBeTruthy()
  })

  it('says Deleted instead of a dash when the environment and its project are gone', () => {
    state.items = [
      item({
        id: 'd3',
        projectId: null,
        projectName: null,
        environmentId: null,
        environmentName: null,
      }),
    ]
    render(<ActivitySection orgId="o1" />)
    expect(screen.getAllByText('Deleted')).toHaveLength(2)
  })
})

describe('ActivitySection filters in the URL', () => {
  it('reads the outcome, project, environment and page from the address', () => {
    router.params = { status: 'in-progress', project: PROJECT, environment: ENV, offset: '25' }
    render(<ActivitySection orgId="o1" />)
    expect(state.feedParams.at(-1)).toEqual({
      params: { filter: 'deploying', offset: 25, projectId: PROJECT, environmentId: ENV },
      options: { enabled: true },
    })
  })

  it('writes a filter change to the address and goes back to the first page', () => {
    router.params = { offset: '50' }
    render(<ActivitySection orgId="o1" />)
    fireEvent.click(screen.getByText('Succeeded'))
    expect(router.setParams).toHaveBeenLastCalledWith({
      status: 'succeeded',
      project: undefined,
      environment: undefined,
      offset: undefined,
    })
    fireEvent.click(screen.getByText('pick My App'))
    expect(router.setParams).toHaveBeenLastCalledWith({
      status: undefined,
      project: PROJECT,
      environment: undefined,
      offset: undefined,
    })
  })

  it('offers environments once a project is chosen, and clears them with the project', () => {
    router.params = { project: PROJECT }
    render(<ActivitySection orgId="o1" />)
    fireEvent.click(screen.getByText('pick Production'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ project: PROJECT, environment: ENV })
    )
    fireEvent.click(screen.getByText('pick All projects'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ project: undefined, environment: undefined })
    )
  })

  it('pages through the URL', () => {
    state.items = [item({})]
    state.total = 60
    state.hasMore = true
    router.params = { offset: '25' }
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText('26–26 of 60')).toBeTruthy()
    fireEvent.click(screen.getByText('Next'))
    expect(router.setParams).toHaveBeenLastCalledWith(expect.objectContaining({ offset: '50' }))
    fireEvent.click(screen.getByText('Previous'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: undefined })
    )
  })

  it('ignores a malformed address and shows everything', () => {
    router.params = { status: 'crashing', project: 'nope', offset: '-3' }
    render(<ActivitySection orgId="o1" />)
    expect(state.feedParams.at(-1)).toEqual({
      params: { filter: 'all', offset: 0, projectId: undefined, environmentId: undefined },
      options: { enabled: true },
    })
    expect(screen.getByText('Nothing has been deployed yet.')).toBeTruthy()
  })

  it('reads the filters in the tab pager, where only the global params carry them', () => {
    router.params = { status: 'failed', offset: '25' }
    router.pathname = '/o1/activity/'
    render(<ActivitySection orgId="o1" />)
    expect(state.feedParams.at(-1)).toEqual({
      params: { filter: 'failed', offset: 25, projectId: undefined, environmentId: undefined },
      options: { enabled: true },
    })
    fireEvent.click(screen.getByText('Succeeded'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'succeeded', offset: undefined })
    )
  })

  it('stops polling and ignores other screens’ params while another pager tab is on show', () => {
    router.params = { status: 'failed', project: PROJECT }
    router.pathname = '/o1/projects'
    render(<ActivitySection orgId="o1" />)
    expect(state.feedParams.at(-1)).toEqual({
      params: { filter: 'all', offset: 0, projectId: undefined, environmentId: undefined },
      options: { enabled: false },
    })
  })

  it('keeps the feed off for someone who cannot manage the organization', () => {
    state.canManage = false
    render(<ActivitySection orgId="o1" />)
    expect(screen.getByText(/Only organization owners and managers/)).toBeTruthy()
    expect(state.feedParams.at(-1)).toEqual(
      expect.objectContaining({ options: { enabled: false } })
    )
  })
})
