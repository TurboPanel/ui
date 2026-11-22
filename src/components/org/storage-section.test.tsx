// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageSection } from './storage-section'

const state = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/org/folder-name-fields', () => ({ FolderNameFields: () => null }))
vi.mock('@/components/org/storage-backups-panel', () => ({ StorageBackupsPanel: () => null }))
vi.mock('@/components/org/managed/managed-backup-schedules-panel', () => ({
  BackupSchedulesPanel: () => null,
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  EmptyState: () => null,
  FormField: () => null,
  LoadingState: () => null,
  SectionPanel: ({ children }: { children?: unknown }) => <section>{children as never}</section>,
  SegmentedControl: () => null,
  TextField: () => null,
  TypeNameDeleteButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>
      {label}
    </button>
  ),
}))
vi.mock('@/lib/queries/folders', () => ({ useDirectoryNamesMode: () => 'default' }))
vi.mock('@/lib/queries/services', () => ({ useServices: () => ({ data: { services: [] } }) }))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: { servers: [] } }) }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/storage', () => ({
  useStorage: () => ({
    isLoading: false,
    isError: false,
    data: {
      storage: [{ id: 's1', name: 'uploads', kind: 'directory', copies: [], mounts: [] }],
    },
  }),
  useCreateStorage: () => ({ mutate: vi.fn(), isPending: false, actionError: null }),
  useUpdateStorageMount: () => ({ run: vi.fn(), isPending: false, actionError: null }),
  // `actionError` is null: it is render state, empty inside the call that failed.
  useDeleteStorage: () => ({
    mutate: state.deleteMutate,
    isPending: false,
    variables: undefined,
    actionError: null,
  }),
}))

beforeEach(() => state.deleteMutate.mockReset())
afterEach(cleanup)

describe('StorageSection delete failure', () => {
  it('shows the sentence from the thrown error, not the fallback', () => {
    state.deleteMutate.mockImplementation(
      (_id: string, options?: { onError?: (err: Error) => void }) =>
        options?.onError?.(new Error('Storage is still mounted in a service.'))
    )
    render(<StorageSection orgId="o" environmentId="e" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Storage is still mounted in a service.')).toBeTruthy()
    expect(screen.queryByText('Failed to delete storage')).toBeNull()
  })
})
