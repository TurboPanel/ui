// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  UpgradeHistoryEntry,
  UpgradeRunServerRow,
  UpgradeRunServersPage,
} from '@/lib/instance-api'
import { ServerUpdateLogScreen } from './server-update-log-screen'
import { UpdateHistoryScreen } from './update-history-screen'
import { nextSort, UpdateRunScreen } from './update-run-screen'
import { sortHeaderLabel } from './update-run-servers-table'
import { UpgradeHistoryPanel } from './upgrade-history-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

type Kids = Readonly<{ children?: ReactNode }>
type Option = Readonly<{ value: string | null; label: string }>

vi.mock('@/components/ui', () => ({
  Badge: (props: { label: string }) => <b>{props.label}</b>,
  Button: (props: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button type="button" disabled={props.disabled} onClick={props.onPress}>
      {props.label}
    </button>
  ),
  DataTable: (
    props: Kids & {
      columns: { key: string; header: string }[]
      renderHeaderCell?: (column: { key: string; header: string }) => ReactNode
    }
  ) => (
    <div>
      {props.columns.map((column) => (
        <span key={column.key}>{props.renderHeaderCell?.(column) ?? column.header}</span>
      ))}
      {props.children}
    </div>
  ),
  DataTableRow: (props: Kids & { onPress?: () => void; accessibilityLabel?: string }) =>
    props.onPress ? (
      <button type="button" aria-label={props.accessibilityLabel} onClick={props.onPress}>
        {props.children}
      </button>
    ) : (
      <div>{props.children}</div>
    ),
  DataTableCell: (props: Kids) => <div>{props.children}</div>,
  DataTableEmpty: (props: Kids) => <p>{props.children}</p>,
  InlineNotice: (props: { title: string; actions?: ReactNode }) => (
    <div>
      <p>{props.title}</p>
      {props.actions}
    </div>
  ),
  LoadingState: () => <p>Loading</p>,
  MonoText: (props: Kids) => <code>{props.children}</code>,
  SectionPanel: (props: Kids & { title?: string; hint?: string; headerRight?: ReactNode }) => (
    <section>
      <h2>{props.title}</h2>
      {props.hint ? <p>{props.hint}</p> : null}
      {props.headerRight}
      {props.children}
    </section>
  ),
  SegmentedControl: (props: {
    options: readonly Option[]
    onChange: (value: string | null) => void
  }) => (
    <div>
      {props.options.map((option) => (
        <button key={option.label} type="button" onClick={() => props.onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
  Select: (props: {
    options: readonly Option[]
    accessibilityLabel: string
    onChange: (value: string | null) => void
  }) => (
    <div aria-label={props.accessibilityLabel}>
      {props.options.map((option) => (
        <button key={option.label} type="button" onClick={() => props.onChange(option.value)}>
          {`pick ${option.label}`}
        </button>
      ))}
    </div>
  ),
  TextField: (props: { label: string; value: string; onChangeText: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChangeText(event.target.value)}
    />
  ),
  TextLink: (props: { label: string; onPress: () => void }) => (
    <button type="button" onClick={props.onPress}>
      {props.label}
    </button>
  ),
}))

const router = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => false),
  setParams: vi.fn(),
  params: {} as Record<string, string>,
}))
const { push } = router
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => router.params,
}))

const queries = vi.hoisted(() => ({
  useUpgradeHistory: vi.fn(),
  useUpgradeRunServers: vi.fn(),
}))
vi.mock('@/lib/queries/admin', () => queries)

const ORG_ID = '0190a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b'

const RUN: UpgradeHistoryEntry = {
  id: 'run-1',
  status: 'succeeded',
  phase: null,
  channel: 'canary',
  source: 'auto',
  createdAt: '2026-10-27T10:00:00Z',
  startedAt: '2026-10-27T10:00:00Z',
  finishedAt: '2026-10-27T10:03:10Z',
  startedByEmail: null,
  target: { daemon: { version: '0.1.15' }, instance: null },
  trigger: 'automatic',
  summary: {
    detail: 'steps',
    total: 2,
    updated: 0,
    alreadyCurrent: 2,
    skipped: 0,
    failed: 0,
    inProgress: 0,
  },
}

const SERVER: UpgradeRunServerRow = {
  serverId: '01a163c1-aaaa-7bbb-8ccc-0123456789ab',
  serverName: 'web-1',
  hostname: 'web-1.lan',
  organizationId: 'org-1',
  organizationName: 'Acme',
  datacenterId: 'dc-1',
  datacenterName: 'Tokyo',
  status: 'failed',
  fromVersion: '0.1.14',
  toVersion: '0.1.15',
  fromCommit: 'aaaaaaa',
  toCommit: 'bbbbbbb',
  startedAt: '2026-10-27T10:00:00Z',
  finishedAt: '2026-10-27T10:01:00Z',
  durationMs: 60_000,
  errorCode: 'step_timeout',
  errorMessage: null,
  attempts: 3,
  connected: false,
  lastHeartbeatAt: null,
  components: {
    daemon: {
      stepId: 'step-1',
      unit: 'daemon',
      phase: 'fleet',
      status: 'needs_attention',
      outcome: 'failed',
      fromVersion: '0.1.14',
      toVersion: '0.1.15',
      fromCommit: 'aaaaaaa',
      toCommit: 'bbbbbbb',
      attempts: 3,
      startedAt: '2026-10-27T10:00:00Z',
      finishedAt: '2026-10-27T10:01:00Z',
      lastStageAt: '2026-10-27T10:01:00Z',
      errorCode: 'step_timeout',
      errorMessage: null,
      detail: { restartNote: 'restart command reported an error but the daemon came back' },
    },
  },
}

function serversPage(overrides: Partial<UpgradeRunServersPage> = {}): UpgradeRunServersPage {
  return {
    ok: true,
    run: { ...RUN, status: 'partially_failed' },
    units: ['daemon'],
    statusCounts: {
      all: 1,
      updated: 0,
      already_current: 0,
      skipped: 0,
      failed: 1,
      in_progress: 0,
    },
    organizations: [{ id: 'org-1', name: 'Acme', servers: 1 }],
    servers: [SERVER],
    total: 1,
    ...overrides,
  }
}

function lastServersQuery() {
  const calls = queries.useUpgradeRunServers.mock.calls
  return calls[calls.length - 1]?.[1] as Record<string, unknown>
}

beforeEach(() => {
  push.mockReset()
  router.back.mockReset()
  router.setParams.mockReset()
  router.canGoBack.mockReturnValue(false)
  router.params = {}
  queries.useUpgradeHistory.mockReset()
  queries.useUpgradeRunServers.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('UpdateHistoryScreen', () => {
  it('shows one row per run and reads a no-change run honestly', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 1 } })
    render(<UpdateHistoryScreen />)
    expect(screen.getByText('Update History')).toBeTruthy()
    expect(screen.getByText('Already up to date')).toBeTruthy()
    expect(screen.getAllByText('Automatic').length).toBeGreaterThan(0)
    expect(screen.getByText('3m 10s')).toBeTruthy()
    expect(screen.queryByText(/0\.1\.15 → 0\.1\.15/)).toBeNull()
  })

  it('asks for every run first and writes paging and filters to the URL', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 60 } })
    render(<UpdateHistoryScreen />)
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 25,
      status: 'any',
      trigger: '',
    })
    fireEvent.click(screen.getByText('Next'))
    expect(router.setParams).toHaveBeenLastCalledWith({
      status: undefined,
      trigger: undefined,
      offset: '25',
    })
    fireEvent.click(screen.getByText('pick Failed'))
    expect(router.setParams).toHaveBeenLastCalledWith({
      status: 'failed',
      trigger: undefined,
      offset: undefined,
    })
    fireEvent.click(screen.getByText('Manual'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ trigger: 'manual' })
    )
  })

  it('restores the view from a deep link', () => {
    router.params = { status: 'failed', trigger: 'automatic', offset: '50' }
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 80 } })
    render(<UpdateHistoryScreen />)
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith({
      offset: 50,
      limit: 25,
      status: 'failed',
      trigger: 'automatic',
    })
    expect(screen.getByText('Showing 51–51 of 80')).toBeTruthy()
  })

  it('says "No updates yet" with no runs and no filters, and no stray "None"', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [], total: 0 } })
    render(<UpdateHistoryScreen />)
    expect(screen.getByText('No updates yet.')).toBeTruthy()
    expect(screen.queryByText('No updates match these filters.')).toBeNull()
    expect(screen.queryByText('None')).toBeNull()
  })

  it('moves a page past the end back to the last page, and never says "No updates yet" then', () => {
    router.params = { offset: '75' }
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [], total: 30 } })
    render(<UpdateHistoryScreen />)
    expect(router.setParams).toHaveBeenLastCalledWith(expect.objectContaining({ offset: '25' }))
    expect(screen.queryByText('No updates yet.')).toBeNull()
    expect(screen.getByText(/^Nothing on this page/)).toBeTruthy()
    expect(screen.getByText('Showing 0 of 30')).toBeTruthy()
  })

  it('labels the filters in title case', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 1 } })
    render(<UpdateHistoryScreen />)
    expect(screen.getByText('Any Trigger')).toBeTruthy()
    expect(screen.getByText('pick Partly Failed')).toBeTruthy()
  })

  it('says no updates match when a filter is set', () => {
    router.params = { trigger: 'manual' }
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [], total: 0 } })
    render(<UpdateHistoryScreen />)
    expect(screen.getByText('No updates match these filters.')).toBeTruthy()
    expect(screen.queryByText('None')).toBeNull()
    expect(screen.getByText('Manual')).toBeTruthy()
  })

  it('names the web interface in the target of a run that installed the control plane', () => {
    const run = {
      ...RUN,
      source: 'manual' as const,
      units: ['daemon', 'instance'] as ('daemon' | 'instance')[],
      target: {
        daemon: { version: '0.1.21-canary.8' },
        instance: { version: '0.1.21-canary.8' },
        ui: { version: '0.1.21-canary.8' },
      },
      summary: { ...RUN.summary!, updated: 1, alreadyCurrent: 0, total: 1 },
    }
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [run], total: 1 } })
    render(<UpdateHistoryScreen />)
    expect(
      screen.getByText(
        'Daemon 0.1.21-canary.8 · Control Plane 0.1.21-canary.8 · Web Interface 0.1.21-canary.8'
      )
    ).toBeTruthy()
    expect(screen.getByText('1 server updated')).toBeTruthy()
  })

  it('shows only the error when the first page fails to load', () => {
    queries.useUpgradeHistory.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('HTTP 500: boom'),
    })
    render(<UpdateHistoryScreen />)
    expect(screen.queryByText('No updates match these filters.')).toBeNull()
  })

  it('opens the run screen from a row', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 1 } })
    render(<UpdateHistoryScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Open the update started/ }))
    expect(push).toHaveBeenCalledWith('/admin/updates/runs/run-1')
  })
})

describe('UpgradeHistoryPanel', () => {
  it('lists recent runs that link to their run screen, and links to Update History', () => {
    render(<UpgradeHistoryPanel runs={[RUN]} />)
    fireEvent.click(screen.getByRole('link', { name: /Open the update started/ }))
    expect(push).toHaveBeenCalledWith('/admin/updates/runs/run-1')
    fireEvent.click(screen.getByText('See All'))
    expect(push).toHaveBeenCalledWith('/admin/updates/history')
  })
})

describe('UpdateRunScreen', () => {
  it('shows the run header and one row per server with a column per component', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.getByText('Update Run')).toBeTruthy()
    expect(screen.getAllByText('Canary')).toHaveLength(2)
    expect(screen.getByText('Daemon')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('web-1')).toBeTruthy()
    expect(screen.getByText('Tokyo')).toBeTruthy()
    expect(screen.getByText('Stopped reporting progress')).toBeTruthy()
    expect(screen.getByText('0.1.14 → 0.1.15')).toBeTruthy()
    expect(screen.getByText('Failed (1)')).toBeTruthy()
  })

  it('says when a server that failed before tries again, never the raw message', () => {
    const waiting = {
      ...SERVER,
      status: 'skipped' as const,
      errorCode: 'retry_later',
      errorMessage:
        'It failed to update to this build 3 times. It tries again automatically after 2026-10-27T15:40:00.000Z.',
    }
    queries.useUpgradeRunServers.mockReturnValue({
      data: serversPage({ servers: [waiting] }),
      isFetching: false,
    })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.getByText(/^Tries again (at|on) /)).toBeTruthy()
    expect(screen.queryByText(/2026-10-27T15:40/)).toBeNull()
  })

  it('labels who started the run in title case', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.getAllByText('Started By').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Started by/)).toBeNull()
  })

  it('names every part the run sent as the Update Run target', () => {
    queries.useUpgradeRunServers.mockReturnValue({
      data: serversPage({
        run: {
          ...RUN,
          status: 'succeeded',
          units: ['instance'],
          target: { instance: { version: '0.1.22' }, ui: { version: '0.1.23' } },
        },
      }),
      isFetching: false,
    })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.getByText('Control Plane 0.1.22 · Web Interface 0.1.23')).toBeTruthy()
  })

  it('writes status, organization and sort to the URL', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(lastServersQuery()).toEqual(
      expect.objectContaining({ offset: 0, limit: 50, sort: 'status', dir: 'asc' })
    )
    fireEvent.click(screen.getByText('Failed (1)'))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', offset: undefined })
    )
    fireEvent.click(screen.getByText('pick Acme'))
    expect(router.setParams).toHaveBeenLastCalledWith(expect.objectContaining({ org: 'org-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Duration' }))
    expect(router.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'duration', dir: 'desc' })
    )
  })

  it('restores status, organization, search, sort and page from a deep link', () => {
    router.params = {
      status: 'failed',
      org: ORG_ID,
      q: 'web',
      sort: 'duration',
      dir: 'desc',
      offset: '100',
    }
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(lastServersQuery()).toEqual({
      offset: 100,
      limit: 50,
      sort: 'duration',
      dir: 'desc',
      status: 'failed',
      organizationId: ORG_ID,
      q: 'web',
    })
    expect(screen.getByLabelText('Search')).toHaveProperty('value', 'web')
    expect(screen.getByRole('button', { name: 'Sort by Duration, sorted descending' })).toBeTruthy()
  })

  it('waits for typing to stop before writing the search to the URL', () => {
    vi.useFakeTimers()
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'web' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(router.setParams).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(router.setParams).toHaveBeenCalledWith({ q: 'web', offset: undefined })
  })

  it('links each server to its page and its update log', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.click(screen.getByText('Update log'))
    expect(push).toHaveBeenCalledWith(`/admin/updates/runs/run-1/servers/${SERVER.serverId}`)
    router.params = { status: 'failed', sort: 'duration', dir: 'desc', offset: '100' }
    cleanup()
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.click(screen.getByText('Update log'))
    expect(push).toHaveBeenLastCalledWith(
      `/admin/updates/runs/run-1/servers/${SERVER.serverId}?status=failed&sort=duration&dir=desc&offset=100`
    )
    fireEvent.click(screen.getByText('Server page'))
    expect(push).toHaveBeenCalledWith(`/org-1/servers/${SERVER.serverId}`)
  })

  it('never claims to go to Update History when Back goes somewhere else', () => {
    router.canGoBack.mockReturnValue(true)
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.queryByText('Back to Update History')).toBeNull()
    fireEvent.click(screen.getByText('Back'))
    expect(router.back).toHaveBeenCalledTimes(1)
    cleanup()
    router.canGoBack.mockReturnValue(false)
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.click(screen.getByText('Back to Update History'))
    expect(push).toHaveBeenCalledWith('/admin/updates/history')
  })

  it('drops a hand-edited organization that is not a uuid before asking', () => {
    router.params = { org: 'acme', status: 'failed' }
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(lastServersQuery()).toEqual(
      expect.objectContaining({ organizationId: null, status: 'failed' })
    )
  })

  it('offers Clear filters when the control plane refuses a filter', () => {
    router.params = { status: 'failed', q: 'web', offset: '50' }
    queries.useUpgradeRunServers.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('HTTP 400: invalid_filter'),
    })
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.click(screen.getByText('Clear filters'))
    expect(router.setParams).toHaveBeenLastCalledWith({
      status: undefined,
      org: undefined,
      q: undefined,
      sort: undefined,
      dir: undefined,
      offset: undefined,
    })
  })

  it('does not offer Clear filters for a run that is gone', () => {
    queries.useUpgradeRunServers.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('HTTP 404: upgrade_run_not_found'),
    })
    render(<UpdateRunScreen runId="nope" />)
    expect(screen.queryByText('Clear filters')).toBeNull()
  })

  it('says when the run does not exist', () => {
    queries.useUpgradeRunServers.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('HTTP 404: upgrade_run_not_found'),
    })
    render(<UpdateRunScreen runId="nope" />)
    expect(screen.getByText(/This update was not found/)).toBeTruthy()
  })

  it('explains a run whose per-server detail was pruned', () => {
    const pruned = {
      ...RUN,
      summary: { ...RUN.summary!, detail: 'pruned' as const, updated: null, alreadyCurrent: null },
    }
    queries.useUpgradeRunServers.mockReturnValue({
      data: serversPage({ run: pruned, servers: [], total: 0 }),
      isFetching: false,
    })
    render(<UpdateRunScreen runId="run-1" />)
    expect(screen.getByText(/removed after the retention window/)).toBeTruthy()
    expect(screen.getByText('No servers match these filters.')).toBeTruthy()
  })
})

describe('sortHeaderLabel', () => {
  it('says which way the active column is sorted', () => {
    expect(sortHeaderLabel('Duration', false, 'asc')).toBe('Sort by Duration')
    expect(sortHeaderLabel('Duration', true, 'asc')).toBe('Sort by Duration, sorted ascending')
    expect(sortHeaderLabel('Duration', true, 'desc')).toBe('Sort by Duration, sorted descending')
  })
})

describe('nextSort', () => {
  it('flips the same column and starts time columns newest first', () => {
    expect(nextSort({ sort: 'status', dir: 'asc' }, 'status')).toEqual({
      sort: 'status',
      dir: 'desc',
    })
    expect(nextSort({ sort: 'status', dir: 'asc' }, 'started')).toEqual({
      sort: 'started',
      dir: 'desc',
    })
    expect(nextSort({ sort: 'started', dir: 'desc' }, 'server')).toEqual({
      sort: 'server',
      dir: 'asc',
    })
  })
})

describe('ServerUpdateLogScreen', () => {
  it('asks for just this server and shows each component', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage() })
    render(<ServerUpdateLogScreen runId="run-1" serverId={SERVER.serverId} />)
    expect(queries.useUpgradeRunServers).toHaveBeenCalledWith('run-1', {
      serverId: SERVER.serverId,
      limit: 1,
    })
    expect(screen.getByText('Server Update Log')).toBeTruthy()
    expect(screen.getByText('web-1')).toBeTruthy()
    expect(screen.getByText('Needs Attention')).toBeTruthy()
    expect(screen.getByText('Stopped reporting progress')).toBeTruthy()
    expect(screen.getByText(/daemon came back/)).toBeTruthy()
    fireEvent.click(screen.getByText('Back to Update Run'))
    expect(push).toHaveBeenCalledWith('/admin/updates/runs/run-1')
  })

  it('opened directly, names the run it opens and keeps the filters', () => {
    router.params = { status: 'failed', sort: 'duration', dir: 'desc', offset: '100' }
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage() })
    render(<ServerUpdateLogScreen runId="run-1" serverId={SERVER.serverId} />)
    fireEvent.click(screen.getByText('Back to Update Run'))
    expect(push).toHaveBeenCalledWith(
      '/admin/updates/runs/run-1?status=failed&sort=duration&dir=desc&offset=100'
    )
    expect(router.back).not.toHaveBeenCalled()
  })

  it('with history, reads a plain "Back" and goes back to the exact view', () => {
    router.canGoBack.mockReturnValue(true)
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage() })
    render(<ServerUpdateLogScreen runId="run-1" serverId={SERVER.serverId} />)
    expect(screen.queryByText('Back to Update Run')).toBeNull()
    fireEvent.click(screen.getByText('Back'))
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('names a refused server id instead of a raw error', () => {
    queries.useUpgradeRunServers.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error('HTTP 400: invalid_filter'),
    })
    render(<ServerUpdateLogScreen runId="run-1" serverId="not-a-uuid" />)
    expect(screen.getByText(/does not accept/)).toBeTruthy()
  })

  it('reads a component that was already current as such, never as an update', () => {
    const current: UpgradeRunServerRow = {
      ...SERVER,
      status: 'already_current',
      errorCode: null,
      components: {
        daemon: {
          ...SERVER.components.daemon!,
          status: 'done',
          outcome: 'already_current',
          fromVersion: '0.1.15',
          attempts: 0,
          errorCode: null,
          detail: null,
        },
      },
    }
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage({ servers: [current] }) })
    render(<ServerUpdateLogScreen runId="run-1" serverId={SERVER.serverId} />)
    expect(screen.getByText('Already up to date (0.1.15)')).toBeTruthy()
    expect(screen.queryByText(/0\.1\.15 → 0\.1\.15/)).toBeNull()
  })

  it('says when the server was not part of the run', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage({ servers: [] }) })
    render(<ServerUpdateLogScreen runId="run-1" serverId="other" />)
    expect(screen.getByText('This server was not part of this update.')).toBeTruthy()
  })
})
