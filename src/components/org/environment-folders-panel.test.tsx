// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentFoldersPanel } from './environment-folders-panel'

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
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
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
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
})
