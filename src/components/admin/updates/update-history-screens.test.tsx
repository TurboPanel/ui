// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  UpgradeHistoryEntry,
  UpgradeRunServerRow,
  UpgradeRunServersPage,
} from '@/lib/instance-api'
import { ServerUpdateLogScreen } from './server-update-log-screen'
import { UpdateHistoryScreen } from './update-history-screen'
import { nextSort, UpdateRunScreen } from './update-run-screen'
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
  InlineNotice: (props: { title: string }) => <p>{props.title}</p>,
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

const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))

const queries = vi.hoisted(() => ({
  useUpgradeHistory: vi.fn(),
  useUpgradeRunServers: vi.fn(),
}))
vi.mock('@/lib/queries/admin', () => queries)

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
  queries.useUpgradeHistory.mockReset()
  queries.useUpgradeRunServers.mockReset()
})

afterEach(cleanup)

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

  it('asks for every run first and pages and filters on the server', () => {
    queries.useUpgradeHistory.mockReturnValue({ data: { ok: true, runs: [RUN], total: 60 } })
    render(<UpdateHistoryScreen />)
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 25,
      status: 'any',
      trigger: '',
    })
    fireEvent.click(screen.getByText('Next'))
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25 })
    )
    fireEvent.click(screen.getByText('pick Failed'))
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 0, status: 'failed' })
    )
    fireEvent.click(screen.getByText('Manual'))
    expect(queries.useUpgradeHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ trigger: 'manual' })
    )
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
    fireEvent.click(screen.getByText('See all'))
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

  it('sends status, organization, search and sort to the control plane', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    expect(lastServersQuery()).toEqual(
      expect.objectContaining({ offset: 0, limit: 50, sort: 'status', dir: 'asc' })
    )
    fireEvent.click(screen.getByText('Failed (1)'))
    expect(lastServersQuery()).toEqual(expect.objectContaining({ status: 'failed' }))
    fireEvent.click(screen.getByText('pick Acme'))
    expect(lastServersQuery()).toEqual(expect.objectContaining({ organizationId: 'org-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Duration' }))
    expect(lastServersQuery()).toEqual(expect.objectContaining({ sort: 'duration', dir: 'desc' }))
  })

  it('links each server to its page and its update log', () => {
    queries.useUpgradeRunServers.mockReturnValue({ data: serversPage(), isFetching: false })
    render(<UpdateRunScreen runId="run-1" />)
    fireEvent.click(screen.getByText('Update log'))
    expect(push).toHaveBeenCalledWith(`/admin/updates/runs/run-1/servers/${SERVER.serverId}`)
    fireEvent.click(screen.getByText('Server page'))
    expect(push).toHaveBeenCalledWith(`/org-1/servers/${SERVER.serverId}`)
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
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('Stopped reporting progress')).toBeTruthy()
    expect(screen.getByText(/daemon came back/)).toBeTruthy()
    fireEvent.click(screen.getByText('Back to Update Run'))
    expect(push).toHaveBeenCalledWith('/admin/updates/runs/run-1')
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
