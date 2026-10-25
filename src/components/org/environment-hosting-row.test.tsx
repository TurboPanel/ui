// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveHostingServiceContext } from '@/lib/compose/hosting-service-context'
import { normalizeCompose } from '@/lib/compose'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/org/hosting-certificate-panel', () => ({
  HostingCertificatePanel: () => null,
  HostingCertificateActionsContext: {},
}))
vi.mock('@/components/org/compose-editor-section', () => ({ ComposeEditorSection: () => null }))
vi.mock('@/components/org/compose-persistence', () => ({ usePersistEnvironmentCompose: vi.fn() }))
vi.mock('@/components/org/project/preview-deployment-modal', () => ({}))
vi.mock('@/components/org/logs/container-log-tail', () => ({ ContainerLogTail: () => null }))
vi.mock('@/components/org/managed/container-status-badge', () => ({}))
vi.mock('@/components/org/service-settings-panel', () => ({ ServiceSettingsPanel: () => null }))
vi.mock('@/components/org/storage-section', () => ({ StorageSection: () => null }))
vi.mock('@/components/org/variables-section', () => ({ VariablesSection: () => null }))
vi.mock('@/components/org/removed-service-card', () => ({ RemovedServiceCard: () => null }))
vi.mock('@/components/org/project/hosting-host-picker', () => ({ HostingHostPicker: () => null }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: () => null,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Checkbox: () => null,
  EmptyState: () => null,
  LoadingState: () => null,
  SegmentedControl: () => null,
  Button: ({ label, busy, busyLabel }: { label: string; busy?: boolean; busyLabel?: string }) => (
    <button>{busy && busyLabel ? busyLabel : label}</button>
  ),
  TextField: ({ label, error }: { label: string; error?: string | null }) => (
    <label>
      {label}
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
}))

import { HostingPanelRow, readHostingEditor } from './environment-detail-section'

afterEach(cleanup)

const serviceContext = resolveHostingServiceContext(
  normalizeCompose({ services: { web: { image: 'nginx' } } }),
  'web'
)

function drawRow(props: Partial<Parameters<typeof HostingPanelRow>[0]> = {}) {
  render(
    <HostingPanelRow
      orgId="o1"
      composeServiceName="web"
      serviceContext={serviceContext}
      hostingId={null}
      expanded
      onToggleExpanded={vi.fn()}
      editor={{ ...readHostingEditor([]), hostnames: 'testing.example' }}
      tlsOptions={[]}
      publicIps={[]}
      saving={false}
      disabled={false}
      onChange={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  )
}

describe('HostingPanelRow save feedback', () => {
  it('says a missing hostname under the Hostname field', () => {
    drawRow({
      composeRoute: 'route-1',
      note: { tone: 'error', field: 'hostnames', message: 'Enter a hostname for this route.' },
    })
    const message = screen.getByRole('alert')
    expect(message.textContent).toBe('Enter a hostname for this route.')
    expect(message.parentElement?.textContent).toContain('Hostname')
  })

  it('says the outcome right after the save button', () => {
    drawRow({ note: { tone: 'ok', message: 'Saved. Let’s Encrypt was asked for a certificate.' } })
    const message = screen.getByText('Saved. Let’s Encrypt was asked for a certificate.')
    expect(message.previousElementSibling?.textContent).toBe('Save hosting')
  })

  it('says the certificate is part of the save while it runs', () => {
    drawRow({ saving: true, editor: { ...readHostingEditor([]), getLetsEncrypt: true } })
    expect(screen.getByText('Saving and asking Let’s Encrypt…')).toBeTruthy()
  })

  it('shows the saved hostname in the header, not "no hostnames"', () => {
    drawRow()
    expect(screen.getAllByText(/testing\.example/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/no hostnames/)).toBeNull()
  })
})
