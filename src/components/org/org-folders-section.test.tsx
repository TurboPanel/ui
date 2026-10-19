// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgFoldersSection } from './org-folders-section'

const state = vi.hoisted(() => ({
  canManage: true,
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
  mutate: vi.fn(),
  pending: false,
  variables: undefined as string | undefined,
  removeError: false,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canManage }))
vi.mock('@/lib/queries/folders', () => ({
  useOrgFolders: (_orgId: string, _canManage: boolean, limit?: number) => ({
    limit,
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    error: state.error,
  }),
  useRemoveFolder: () => ({
    mutate: state.mutate,
    isPending: state.pending,
    variables: state.variables,
    isError: state.removeError,
    error: new Error('folder_in_use'),
  }),
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  ConfirmButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{label}</button>
  ),
  InlineNotice: ({ title, body }: { title: string; body: string }) => (
    <div>
      <b>{title}</b>
      <p>{body}</p>
    </div>
  ),
  LoadingState: ({ label }: { label?: string }) => <div>{label}</div>,
  SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
}))

const ROWS = [
  {
    id: 'f1',
    kind: 'service',
    state: 'orphan',
    scope: 'production',
    slug: 'old.example.com',
    serverId: 's1',
    serverName: 'Beta',
    owner: 'shop',
    hasAsset: false,
    action: 'remove',
    reason: 'no service or volume owns this folder on server Beta',
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
  {
    id: 'f2',
    kind: 'volume',
    state: 'removing',
    scope: 'production',
    slug: 'uploads',
    serverId: 's1',
    serverName: 'Beta',
    assetName: 'Uploads',
    owner: 'shop',
    hasAsset: false,
    action: 'retry',
    reason:
      'being removed from server Beta; the server could not remove it yet: a container still has the folder open',
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
  {
    id: 'f3',
    kind: 'volume',
    state: 'missing',
    scope: 'common',
    slug: 'lost',
    serverId: 's1',
    owner: 'shop',
    hasAsset: false,
    action: 'forget',
    reason: null,
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
]

beforeEach(() => {
  state.canManage = true
  state.data = undefined
  state.isLoading = false
  state.isError = false
  state.error = null
  state.mutate = vi.fn()
  state.pending = false
  state.variables = undefined
  state.removeError = false
})
afterEach(() => {
  cleanup()
})

describe('OrgFoldersSection', () => {
  it('shows nothing to people who cannot manage the organization', () => {
    state.canManage = false
    state.data = { ok: true, total: 3, folders: ROWS }
    render(<OrgFoldersSection orgId="o" />)
    expect(screen.queryByText('Folders that need attention')).toBeNull()
  })

  it('says it is checking, and shows a failure', () => {
    state.isLoading = true
    const { unmount } = render(<OrgFoldersSection orgId="o" />)
    expect(screen.getByText('Checking the folders on your servers…')).toBeTruthy()
    unmount()
    state.isLoading = false
    state.isError = true
    state.error = new Error('HTTP 500: boom')
    render(<OrgFoldersSection orgId="o" />)
    expect(screen.getByText(/HTTP 500: boom/)).toBeTruthy()
  })

  it('hides itself when nothing needs a person', () => {
    state.data = { ok: true, total: 0, folders: [] }
    render(<OrgFoldersSection orgId="o" />)
    expect(screen.queryByText('Folders that need attention')).toBeNull()
  })

  it('lists each folder with its reason, warns about orphans and runs the action of the row', () => {
    state.data = { ok: true, total: 5, folders: ROWS }
    render(<OrgFoldersSection orgId="o" />)
    expect(
      screen.getByText('1 folder on your servers no longer belongs to a service or volume')
    ).toBeTruthy()
    expect(screen.getByText('old.example.com (service on server Beta)')).toBeTruthy()
    expect(screen.getByText('Not in TurboPanel')).toBeTruthy()
    expect(screen.getByText(/a container still has the folder open/)).toBeTruthy()
    expect(screen.getByText('Show more (2 not shown)')).toBeTruthy()
    fireEvent.click(screen.getByText('Remove from server'))
    expect(state.mutate).toHaveBeenCalledWith('f1')
    fireEvent.click(screen.getByText('Try again now'))
    expect(state.mutate).toHaveBeenCalledWith('f2')
    fireEvent.click(screen.getByText('Forget'))
    expect(state.mutate).toHaveBeenCalledWith('f3')
  })

  it('locks the buttons while one change is running and shows why a change was refused', () => {
    state.data = { ok: true, total: 3, folders: ROWS }
    state.pending = true
    state.variables = 'f1'
    state.removeError = true
    render(<OrgFoldersSection orgId="o" />)
    expect(screen.getByText(/A service or volume is using this folder/)).toBeTruthy()
  })

  it('uses plural wording for several orphans', () => {
    state.data = {
      ok: true,
      total: 2,
      folders: [ROWS[0], { ...ROWS[0], id: 'f4', slug: 'second.example.com' }],
    }
    render(<OrgFoldersSection orgId="o" />)
    expect(
      screen.getByText('2 folders on your servers no longer belong to a service or volume')
    ).toBeTruthy()
  })

  it('shows more on request, and is honest when even a full page is not everything', () => {
    state.data = { ok: true, total: 150, folders: ROWS }
    render(<OrgFoldersSection orgId="o" />)
    fireEvent.click(screen.getByText('Show more (147 not shown)'))
    expect(screen.getByText(/and 147 more\. Settle some of these to see the rest\./)).toBeTruthy()
    expect(screen.queryByText(/Show more/)).toBeNull()
  })
})
