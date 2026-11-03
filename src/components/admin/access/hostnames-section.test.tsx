// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostnamesSection } from './hostnames-section'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  hostnames: vi.fn(),
  addRow: vi.fn(),
  editorRead: vi.fn(),
}))

const idle = { run: vi.fn(), mutate: vi.fn(), isPending: false, actionError: null }

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => ({
  ...(await import('./access-ui-stub')).accessUiStub,
  CopyButton: () => null,
  ModalSheet: () => null,
  StatusDot: () => null,
}))
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('@/components/admin/public-url-fields', () => ({
  AddPublicUrlRow: (props: Readonly<{ selfHosted?: boolean }>) => {
    mocks.addRow(props)
    return <p>Add Row</p>
  },
  PublicUrlsApplyFeedback: () => null,
}))
vi.mock('./connection-mode-cell', () => ({
  ConnectionModeCell: () => null,
  IngressPhaseChip: () => null,
  SAVE_FIRST_HINT: '',
  SAVE_OTHERS_HINT: '',
}))
vi.mock('./hostname-ingress-cells', () => ({
  ModePublicPortCell: () => null,
  PrimaryCell: () => null,
}))
vi.mock('./edge-gate-status', () => ({ EdgeGateStatus: () => null }))
vi.mock('@/lib/queries/ingress', () => ({
  useIngressAccounts: () => ({ data: { accounts: [] } }),
  useIngressCapabilities: () => ({ data: undefined }),
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceHostnames: mocks.hostnames,
  useLetsEncryptTermsGuard: () => () => null,
  useInstanceCertificates: () => {
    mocks.editorRead()
    return { data: { certificates: [] } }
  },
  useInstanceDaemon: () => ({ data: undefined, isLoading: false, isError: false }),
  useSaveInstanceHostnames: () => idle,
  useApplyPublicUrls: () => idle,
}))

// The editor's panel; the page title is plain text, the High Availability panel is "Address".
const editorPanel = () => screen.queryByRole('heading', { name: 'Hostnames' })

function renderOn(runtime: string | undefined, query: Record<string, unknown>) {
  mocks.useAuth.mockReturnValue({ controlPlaneRuntime: runtime })
  mocks.hostnames.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...query })
  render(<HostnamesSection />)
}

function expectNoEditor() {
  expect(editorPanel()).toBeNull()
  expect(mocks.addRow).not.toHaveBeenCalled()
  expect(mocks.editorRead).not.toHaveBeenCalled()
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HostnamesSection view by runtime', () => {
  it('shows the editor with the self-hosted add row on the self-hosted runtime', () => {
    renderOn('deno', { data: { hostnames: [] } })
    expect(editorPanel()).toBeTruthy()
    expect(screen.getByText('Add Row')).toBeTruthy()
    const calls = mocks.addRow.mock.calls
    expect(calls[calls.length - 1]?.[0]?.selfHosted).toBe(true)
  })

  it('shows a neutral loading state while the runtime is unknown', () => {
    renderOn(undefined, { isLoading: true })
    expect(screen.getByText('Loading')).toBeTruthy()
    expect(screen.queryByText(/Platform-managed/)).toBeNull()
    expect(mocks.hostnames).not.toHaveBeenCalled()
    expectNoEditor()
  })

  it('keeps the read-only view on High Availability while hostnames load', () => {
    renderOn('workers', { isLoading: true })
    expect(screen.getByText(/Platform-managed/)).toBeTruthy()
    expect(screen.getByText('Loading')).toBeTruthy()
    expectNoEditor()
  })

  it('keeps the read-only view on High Availability when the read fails', () => {
    renderOn('workers', { isError: true, error: new Error('Service unavailable') })
    expect(screen.getByText(/Platform-managed/)).toBeTruthy()
    expect(screen.getByText('Service unavailable')).toBeTruthy()
    expect(screen.queryByText('No fixed address configured')).toBeNull()
    expectNoEditor()
  })

  it('shows the fixed address on High Availability', () => {
    renderOn('workers', {
      data: { hostnames: [], platformManagedOrigin: 'https://panel.example.com' },
    })
    expect(screen.getByText('https://panel.example.com')).toBeTruthy()
    expectNoEditor()
  })

  it('never shows the editor on High Availability, even without a fixed address', () => {
    renderOn('workers', { data: { hostnames: [] } })
    expect(screen.getByText('No fixed address configured')).toBeTruthy()
    expectNoEditor()
  })
})
