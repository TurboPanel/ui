// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationActivityItem } from '@/lib/instance-api'
import { ActivitySection } from './activity-section'

const state = vi.hoisted(() => ({ items: [] as unknown[] }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/pull-to-refresh', () => ({ usePullToRefresh: () => undefined }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/activity', () => ({
  ACTIVITY_PAGE_SIZE: 25,
  useOrganizationActivity: () => ({
    data: { items: state.items, total: state.items.length, hasMore: false },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  DataTable: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DataTableCell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DataTableRow: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  SectionPanel: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}))

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

describe('ActivitySection states', () => {
  afterEach(cleanup)

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
})
