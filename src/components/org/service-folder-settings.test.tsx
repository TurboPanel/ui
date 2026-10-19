// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceRecord } from '@/lib/instance-api'
import { ServiceFolderSettings } from './service-folder-settings'

const state = vi.hoisted(() => ({
  mode: 'slug' as 'slug' | 'uuid' | 'both',
  folders: { data: undefined as unknown, isLoading: false, isError: false },
  update: { mutate: vi.fn(), isPending: false },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, detailCard: {}, detailTitle: {} },
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/folders', () => ({
  useDirectoryNamesMode: () => state.mode,
  useEnvironmentFolders: () => state.folders,
}))
vi.mock('@/lib/queries/services', () => ({ useUpdateService: () => state.update }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  FormField: ({ label, children }: { label: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      {children as never}
    </div>
  ),
  SegmentedControl: ({
    value,
    onChange,
    disabled,
  }: {
    value: string
    onChange: (v: string) => void
    disabled?: boolean
  }) => (
    <div data-testid="kind" data-value={value}>
      <button disabled={disabled} onClick={() => onChange('uuid')}>
        pick id
      </button>
    </div>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
    editable,
    error,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
    editable?: boolean
    error?: string | null
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        disabled={editable === false}
        onChange={(e) => onChangeText(e.target.value)}
      />
      {error ? <span>{error}</span> : null}
    </label>
  ),
  Toggle: ({
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    disabled?: boolean
    onValueChange: () => void
    accessibilityLabel: string
  }) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onValueChange} />,
}))

const service = (over: Partial<ServiceRecord> = {}): ServiceRecord =>
  ({
    id: 'svc1',
    name: 'Site',
    description: null,
    environmentId: 'env1',
    composeServiceName: 'web',
    slug: 'example.com',
    common: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as ServiceRecord

beforeEach(() => {
  state.mode = 'slug'
  state.folders = { data: { ok: true, total: 0, folders: [] }, isLoading: false, isError: false }
  state.update = { mutate: vi.fn(), isPending: false }
})
afterEach(() => cleanup())

const mount = (s = service()) =>
  render(<ServiceFolderSettings orgId="o" service={s} canManage />)

describe('ServiceFolderSettings', () => {
  it('lets the name be changed before any folder exists, and saves it', () => {
    mount()
    expect(screen.getByText(/example.com, in the folder named after its environment/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'shop.example.com' } })
    fireEvent.click(screen.getByText('Save folder name'))
    expect(state.update.mutate).toHaveBeenCalledWith(
      { slug: 'shop.example.com' },
      expect.anything()
    )
  })

  it('refuses a bad name before sending it', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Bad Name' } })
    expect(screen.getByText(/Lowercase letters/)).toBeTruthy()
    expect((screen.getByText('Save folder name') as HTMLButtonElement).disabled).toBe(true)
  })

  it('locks once the service has a folder and says so', () => {
    state.folders = {
      data: { ok: true, total: 1, folders: [{ id: 'f', assetId: 'svc1' }] },
      isLoading: false,
      isError: false,
    }
    mount()
    expect(screen.getByText(/Locked: this service already has a folder/)).toBeTruthy()
    expect((screen.getByLabelText('Folder name') as HTMLInputElement).disabled).toBe(true)
    expect(
      (screen.getByLabelText('Share this service across environments') as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('does not look editable while the folders are being checked', () => {
    state.folders = { data: undefined, isLoading: true, isError: false }
    mount()
    expect(screen.getByText('Checking whether it already has a folder…')).toBeTruthy()
    expect((screen.getByLabelText('Folder name') as HTMLInputElement).disabled).toBe(true)
  })

  it('stays read-only when the check fails', () => {
    state.folders = { data: undefined, isLoading: false, isError: true }
    mount()
    expect(screen.getByText(/read-only for now/)).toBeTruthy()
    expect((screen.getByLabelText('Folder name') as HTMLInputElement).disabled).toBe(true)
  })

  it('starts on the kind the saved folder name already is', () => {
    state.mode = 'both'
    mount(service({ slug: '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab' }))
    expect(screen.getByTestId('kind').dataset.value).toBe('uuid')
    cleanup()
    mount(service({ slug: 'example.com' }))
    expect(screen.getByTestId('kind').dataset.value).toBe('slug')
  })

  it('shares across environments with one switch', () => {
    mount()
    fireEvent.click(screen.getByLabelText('Share this service across environments'))
    expect(state.update.mutate).toHaveBeenCalledWith({ common: true }, expect.anything())
  })
})
