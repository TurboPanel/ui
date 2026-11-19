// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CertificatesSection } from './certificates-section'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => {
  const { accessUiStub } = await import('./access-ui-stub')
  const none = () => null
  const fallback = Object.fromEntries(
    [
      'Badge',
      'ButtonRow',
      'Checkbox',
      'DataTable',
      'DataTableCell',
      'DataTableEmpty',
      'DataTableRow',
      'SettingRow',
      'TextField',
      'Toggle',
    ].map((key) => [key, none])
  )
  return { ...fallback, ...accessUiStub }
})
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ controlPlaneRuntime: 'self-hosted' }) }))
vi.mock('@/components/admin/access/dns01-certificates-panel', () => ({
  CoverageChips: () => null,
  Dns01CertificatesPanel: () => null,
}))
vi.mock('@/components/admin/access/certificate-attachment-editor', () => ({
  AttachmentEditor: (props: { capabilitiesStatus?: string }) => (
    <div data-testid="attachment-editor">{props.capabilitiesStatus}</div>
  ),
}))

const mocks = vi.hoisted(() => ({ daemon: vi.fn() }))

vi.mock('@/lib/queries/admin', () => {
  const idle = { data: undefined, isLoading: false, isError: false }
  return {
    useInstanceCertificates: () => ({
      ...idle,
      data: {
        certificates: [{ id: 'c1', label: 'Edge pair', dnsNames: [], hostnames: [] }],
      },
    }),
    useInstanceHostnames: () => ({ ...idle, data: { hostnames: [] } }),
    useInstanceAcmeSettings: () => idle,
    useInstanceDaemon: () => mocks.daemon(),
    useSaveInstanceAcmeSettings: () => ({ run: vi.fn(), isPending: false }),
    useUploadInstanceCertificate: () => ({ run: vi.fn(), isPending: false }),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CertificatesSection daemon state', () => {
  it.each([
    ['loading', { data: undefined, isError: false }],
    ['error', { data: undefined, isError: true }],
    ['not-applicable', { data: { applicable: false }, isError: false }],
    ['disconnected', { data: { applicable: true, connected: false }, isError: false }],
    ['ready', { data: { applicable: true, connected: true }, isError: false }],
  ] as const)('hands the attachment editor a %s daemon state', (status, query) => {
    mocks.daemon.mockReturnValue(query)
    render(<CertificatesSection />)
    expect(screen.getByTestId('attachment-editor').textContent).toBe(status)
  })
})
