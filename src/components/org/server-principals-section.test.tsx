// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerPrincipalsSection } from './server-principals-section'

const state = vi.hoisted(() => ({
  query: { isLoading: false, error: null as Error | null, data: undefined as unknown },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, detailLine: {} },
}))
vi.mock('@/lib/queries/servers', () => ({ useServerPrincipals: () => state.query }))
vi.mock('@/components/ui', () => {
  const passthrough = ({ children }: { children?: unknown }) => <div>{children as never}</div>
  return {
    Badge: ({ label }: { label: string }) => <span>{label}</span>,
    DataTable: passthrough,
    DataTableCell: passthrough,
    DataTableEmpty: passthrough,
    DataTableRow: passthrough,
    InlineNotice: ({ title }: { title: string }) => <strong>{title}</strong>,
    LoadingState: ({ label }: { label?: string }) => <div>{label}</div>,
    MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
    SectionPanel: ({ title, hint, children }: { title?: string; hint?: string; children?: unknown }) => (
      <section>
        <h2>{title}</h2>
        <p>{hint}</p>
        {children as never}
      </section>
    ),
  }
})

afterEach(() => {
  cleanup()
  state.query = { isLoading: false, error: null, data: undefined }
})

describe('ServerPrincipalsSection', () => {
  it('lists placements with ids, home, state and what else uses each', () => {
    state.query.data = {
      serverId: 's1',
      principals: [
        {
          placementId: 'pl1',
          principalId: 'p1',
          username: 'shop',
          appliedUsername: 'shop_abc',
          projectId: null,
          state: 'pending',
          uid: 15002,
          gid: 15002,
          home: '/srv/users/shop_abc',
          source: 'compose',
          usedBy: { tenancies: 1, bindings: 0, storages: 0, secrets: 0, logins: 0, otherPlacements: 0 },
        },
        {
          placementId: 'pl2',
          principalId: 'p2',
          username: 'solo',
          appliedUsername: 'solo',
          projectId: null,
          state: 'present',
          uid: null,
          gid: null,
          home: '/srv/users/solo',
          source: 'manual',
          usedBy: { tenancies: 0, bindings: 0, storages: 0, secrets: 0, logins: 0, otherPlacements: 0 },
        },
      ],
    }
    render(<ServerPrincipalsSection orgId="org-1" serverId="s1" canManage />)
    expect(screen.getByText('shop_abc')).toBeTruthy()
    expect(screen.getByText('15002')).toBeTruthy()
    expect(screen.getByText('Being set up')).toBeTruthy()
    expect(screen.getByText('1 service runs as it')).toBeTruthy()
    expect(screen.getByText('Not reported yet')).toBeTruthy()
    expect(screen.getByText('Only this server')).toBeTruthy()
  })

  it('says so when nothing is placed, and when loading fails', () => {
    state.query.data = { serverId: 's1', principals: [] }
    const { unmount } = render(<ServerPrincipalsSection orgId="org-1" serverId="s1" canManage />)
    expect(screen.getByText('No Hosting Accounts are placed on this server.')).toBeTruthy()
    unmount()
    state.query = { isLoading: false, error: new Error('x'), data: undefined }
    render(<ServerPrincipalsSection orgId="org-1" serverId="s1" canManage />)
    expect(screen.getByText('Could not load the Hosting Accounts on this server')).toBeTruthy()
  })

  it('asks members without manager rights to ask a manager, without loading', () => {
    render(<ServerPrincipalsSection orgId="org-1" serverId="s1" canManage={false} />)
    expect(screen.getByText(/Only organization owners and managers/)).toBeTruthy()
  })
})
