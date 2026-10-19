// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentFoldersPanel } from './environment-folders-panel'

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
  mutate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {} },
}))
vi.mock('@/lib/queries/folders', () => ({
  useEnvironmentFolders: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    error: state.error,
  }),
  useRemoveFolder: () => ({ mutate: state.mutate, isPending: false, isError: false }),
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  ConfirmButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{label}</button>
  ),
  LoadingState: ({ label }: { label?: string }) => <div>{label}</div>,
  SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
}))

beforeEach(() => {
  state.data = undefined
  state.isLoading = false
  state.isError = false
  state.error = null
})
afterEach(() => {
  cleanup()
})

describe('EnvironmentFoldersPanel', () => {
  it('says it is checking while the folders load', () => {
    state.isLoading = true
    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" />)
    expect(screen.getByText('Checking for folders…')).toBeTruthy()
  })

  it('shows a failure and warns that locks may apply', () => {
    state.isError = true
    state.error = new Error('HTTP 500: boom')
    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" />)
    expect(screen.getByText(/HTTP 500: boom/)).toBeTruthy()
    expect(screen.getByText(/may be refused until they load/)).toBeTruthy()
  })

  it('shows nothing when the environment has no folders', () => {
    state.data = { ok: true, total: 0, folders: [] }
    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" />)
    expect(screen.queryByText('Folders on your servers')).toBeNull()
  })

  it('lists folders with their state and why one is still there', () => {
    state.data = {
      ok: true,
      total: 22,
      folders: [
        {
          id: 'f1',
          kind: 'volume',
          state: 'removing',
          scope: 'production',
          slug: 'uploads',
          serverId: 's1',
          serverName: 'Beta',
          assetName: 'Uploads',
          reason: 'being removed, waiting for server Beta to come back',
        },
        {
          id: 'f2',
          kind: 'service',
          state: 'orphan',
          scope: 'production',
          slug: 'old.example.com',
          serverId: 's1',
          serverName: 'Beta',
        },
      ],
    }
    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" />)
    expect(screen.getByText('Folders on your servers')).toBeTruthy()
    expect(screen.getByText('Uploads (volume on server Beta)')).toBeTruthy()
    expect(screen.getByText('being removed, waiting for server Beta to come back')).toBeTruthy()
    expect(screen.getByText('Being removed')).toBeTruthy()
    expect(screen.getByText('Not in TurboPanel')).toBeTruthy()
    expect(screen.getByText('and 20 more.')).toBeTruthy()
  })

  it('offers to remove an orphan and to retry a stuck removal only to someone who can manage', () => {
    state.data = {
      ok: true,
      total: 2,
      folders: [
        { id: 'f1', kind: 'volume', state: 'removing', scope: 'p', slug: 'a', serverId: 's' },
        { id: 'f2', kind: 'service', state: 'orphan', scope: 'p', slug: 'b', serverId: 's' },
      ],
    }
    const { unmount } = render(<EnvironmentFoldersPanel orgId="o" environmentId="e" />)
    expect(screen.queryByText('Remove from server')).toBeNull()
    expect(screen.queryByText('Try again now')).toBeNull()
    unmount()

    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" canManage />)
    fireEvent.click(screen.getByText('Remove from server'))
    expect(state.mutate).toHaveBeenCalledWith('f2')
    fireEvent.click(screen.getByText('Try again now'))
    expect(state.mutate).toHaveBeenCalledWith('f1')
  })

  it('offers no removal for an orphan a service or volume still names', () => {
    state.data = {
      ok: true,
      total: 2,
      folders: [
        {
          id: 'f1',
          kind: 'service',
          state: 'orphan',
          scope: 'p',
          slug: 'named',
          serverId: 's',
          assetId: 'svc-1',
        },
        { id: 'f2', kind: 'service', state: 'orphan', scope: 'p', slug: 'free', serverId: 's' },
      ],
    }
    render(<EnvironmentFoldersPanel orgId="o" environmentId="e" canManage />)
    expect(screen.getAllByText('Remove from server')).toHaveLength(1)
    fireEvent.click(screen.getByText('Remove from server'))
    expect(state.mutate).toHaveBeenCalledWith('f2')
  })
})
