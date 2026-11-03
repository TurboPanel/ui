// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlPlaneUrlsSection } from '../control-plane-urls-section'
import { HostnamesSection } from './hostnames-section'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  hostnames: vi.fn(),
  addRow: vi.fn(),
}))

const idle = { run: vi.fn(), mutate: vi.fn(), isPending: false, actionError: null }
// One stable object: a fresh `data` each render would re-run the section's sync effect forever.
const publicUrls = { data: { urls: [] }, isLoading: false, isError: false }

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => ({
  ...(await import('./access-ui-stub')).accessUiStub,
  CopyButton: () => null,
  EmptyState: ({ title }: Readonly<{ title: string }>) => <p>{title}</p>,
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
  PublicUrlParts: ({ url }: Readonly<{ url: string }>) => <p>{url}</p>,
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
  useInstanceCertificates: () => ({ data: { certificates: [] } }),
  useInstanceDaemon: () => ({ data: undefined, isLoading: false, isError: false }),
  useSaveInstanceHostnames: () => idle,
  useApplyPublicUrls: () => idle,
  usePublicUrls: () => publicUrls,
  useSavePublicUrls: () => idle,
}))

function lastAddRowProps(): { selfHosted?: boolean } {
  const calls = mocks.addRow.mock.calls
  return calls[calls.length - 1]?.[0] ?? {}
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('add row runtime flag', () => {
  it('passes selfHosted to the add row on the self-hosted runtime', () => {
    mocks.useAuth.mockReturnValue({ controlPlaneRuntime: 'deno' })
    mocks.hostnames.mockReturnValue({ data: { hostnames: [] }, isLoading: false })
    render(<HostnamesSection />)
    expect(screen.getByText('Add Row')).toBeTruthy()
    expect(lastAddRowProps().selfHosted).toBe(true)
  })

  it('does not pass selfHosted on High Availability', () => {
    mocks.useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    mocks.hostnames.mockReturnValue({ data: { hostnames: [] }, isLoading: false })
    render(<HostnamesSection />)
    expect(screen.getByText('Add Row')).toBeTruthy()
    expect(lastAddRowProps().selfHosted).toBe(false)
  })

  it('shows no add row for a platform-managed High Availability address', () => {
    mocks.useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    mocks.hostnames.mockReturnValue({
      data: { hostnames: [], platformManagedOrigin: 'https://panel.example.com' },
      isLoading: false,
    })
    render(<HostnamesSection />)
    expect(screen.getByText('https://panel.example.com')).toBeTruthy()
    expect(mocks.addRow).not.toHaveBeenCalled()
  })

  it('leaves the control plane URL list without the flag', () => {
    render(<ControlPlaneUrlsSection />)
    expect(screen.getByText('Add Row')).toBeTruthy()
    expect(lastAddRowProps().selfHosted).toBeUndefined()
  })
})
