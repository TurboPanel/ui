// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostnamesSection } from './hostnames-section'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  hostnames: vi.fn(),
  editorRead: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/auth-context', () => ({ useAuth: mocks.useAuth }))
// The editor's pieces are React Native; none of them may render on these paths.
vi.mock('@/components/admin/public-url-fields', () => ({
  AddPublicUrlRow: () => null,
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
  useIngressAccounts: mocks.editorRead,
  useIngressCapabilities: mocks.editorRead,
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceHostnames: mocks.hostnames,
  useLetsEncryptTermsGuard: mocks.editorRead,
  useInstanceCertificates: mocks.editorRead,
  useInstanceDaemon: mocks.editorRead,
  useSaveInstanceHostnames: mocks.editorRead,
  useApplyPublicUrls: mocks.editorRead,
}))

const EDITOR_HINT = 'Scheme, host, and port — each name keeps its own certificate source'

function renderOn(runtime: string | undefined, query: Record<string, unknown>) {
  mocks.useAuth.mockReturnValue({ controlPlaneRuntime: runtime })
  mocks.hostnames.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...query })
  render(<HostnamesSection />)
}

function expectNoEditor() {
  expect(screen.queryByText(EDITOR_HINT)).toBeNull()
  expect(mocks.editorRead).not.toHaveBeenCalled()
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HostnamesSection view by runtime', () => {
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

  it('reads an empty address on High Availability as not configured', () => {
    renderOn('workers', { data: { hostnames: [] } })
    expect(screen.getByText('No fixed address configured')).toBeTruthy()
    expectNoEditor()
  })
})
