// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env, styleOf } from '@/components/ui/v4/rn-stub'
import type { ReleaseRecord } from '@/lib/instance-api'
import { ServiceReleasesPanel } from './service-releases-panel'

const state = vi.hoisted(() => ({ releases: [] as unknown[] }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/components/org/logs/log-transcript-view', () => ({ LogTranscriptView: () => null }))
vi.mock('@/components/org/logs/nested-scroll', () => ({
  nestedScrollDomProps: {},
  webNestedScrollStyle: {},
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { error: {} } }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Readonly<{ label: string }>) => <b>{label}</b>,
  ConfirmButton: ({ label, variant }: Readonly<{ label: string; variant?: string }>) => (
    <button type="button" data-variant={variant}>
      {label}
    </button>
  ),
  EmptyState: ({ title }: Readonly<{ title: string }>) => <p>{title}</p>,
  InlineNotice: () => null,
  LoadingState: () => null,
  SectionPanel: ({ children }: Readonly<{ children: ReactNode }>) => <section>{children}</section>,
  StatusDot: () => null,
}))
vi.mock('@/lib/queries/commands', () => ({
  isTerminalCommandStatus: () => true,
  useCommandsBatch: () => ({ data: undefined }),
}))
vi.mock('@/lib/queries/execution-logs', () => ({
  useCommandLog: () => ({ snapshot: { lines: [] } }),
}))
vi.mock('@/lib/queries/releases', () => ({
  invalidateEnvironmentReleases: vi.fn(),
  useRollbackEnvironment: () => ({ isPending: false, actionError: null, run: vi.fn() }),
  useServiceReleases: () => ({ isLoading: false, error: null, data: { releases: state.releases } }),
}))

function release(id: string, live: boolean, message: string): ReleaseRecord {
  return {
    commandId: `cmd-${id}`,
    serverId: 'srv',
    attempts: [],
    composeServiceName: 'web',
    releaseId: id,
    sourceId: 'src',
    commitSha: `${id}abcdef0123`,
    commitMessage: message,
    status: 'succeeded',
    isLive: live,
    queuedAt: '2026-10-24T10:00:00Z',
    finishedAt: '2026-10-24T10:01:00Z',
  } as unknown as ReleaseRecord
}

function panel() {
  return render(
    <ServiceReleasesPanel orgId="o" environmentId="e" composeServiceName="web" canManage />
  )
}

beforeEach(() => {
  env.width = 1200
  state.releases = [
    release('r42', true, 'Fix pricing table layout'),
    release('r41', false, 'Change hero copy'),
  ]
})

afterEach(cleanup)

describe('ServiceReleasesPanel', () => {
  it('gives the header and every row the same action column, on the live row too', () => {
    const { container } = panel()
    expect(screen.getByText('Change')).toBeTruthy()
    const actionCells = [...container.querySelectorAll('div')].filter(
      (node) => styleOf(node).minWidth === 112
    )
    // One for the header, one per release.
    expect(actionCells).toHaveLength(3)
    expect(actionCells[1]?.textContent).toBe('')
    expect(actionCells[2]?.textContent).toBe('Roll back')
  })

  it('rolls back with a quiet button, not a danger one', () => {
    panel()
    expect(screen.getByText('Roll back').dataset.variant).toBe('secondary')
    expect(screen.getAllByText('Roll back')).toHaveLength(1)
  })

  it('stacks each release on a phone with no column titles', () => {
    env.width = 390
    const { container } = panel()
    expect(screen.queryByText('Change')).toBeNull()
    expect(screen.getByText('Change hero copy')).toBeTruthy()
    expect(screen.getByText(/^r41abcd · /)).toBeTruthy()
    expect([...container.querySelectorAll('div')].some((n) => styleOf(n).minWidth === 112)).toBe(
      false
    )
  })

  it('says in words that a failed release cannot be rolled back to', () => {
    state.releases = [
      release('r42', true, 'Fix pricing table layout'),
      { ...release('r41', false, 'Broken build'), status: 'failed' },
      { ...release('r40', false, 'Cancelled build'), status: 'cancelled' },
    ]
    panel()
    expect(screen.queryByText('Roll back')).toBeNull()
    const notes = screen.getAllByText("Can't roll back")
    expect(notes).toHaveLength(2)
    // The short label fits the action cell; the full reason is read out.
    expect(notes[0]?.getAttribute('aria-label')).toBe(
      "Can't roll back to this release: it did not finish building."
    )
  })

  it('never calls a release that is still building unfinished', () => {
    state.releases = [
      release('r42', true, 'Fix pricing table layout'),
      { ...release('r43', false, 'New build'), status: 'running' },
    ]
    panel()
    expect(screen.queryByText("Can't roll back")).toBeNull()
    expect(screen.getByText('Still building').getAttribute('aria-label')).not.toMatch(
      /did not finish/
    )
  })
})
