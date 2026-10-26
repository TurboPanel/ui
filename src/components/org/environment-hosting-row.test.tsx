// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveHostingServiceContext } from '@/lib/compose/hosting-service-context'
import { normalizeCompose } from '@/lib/compose'
import { PENDING_REMOVAL_CERTIFICATE_HINT, pendingRemovalNote } from '@/lib/hosting-plain-words'
import type { HostingRecord } from '@/lib/instance-api'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/org/hosting-certificate-panel', () => ({
  HostingCertificatePanel: ({ disabled }: { disabled: boolean }) => (
    <div data-testid="certificate-panel" data-disabled={String(disabled)} />
  ),
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
vi.mock('@/components/org/project/compose-hostname-actions', () => ({
  ComposeHostnameActions: () => null,
}))
vi.mock('@/components/org/compose-hosting-readonly', () => ({
  COMPOSE_HOSTING_FOCUS_PARAM: 'hosting',
}))
vi.mock('@/components/ui', () => ({
  Badge: () => null,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Checkbox: () => null,
  EmptyState: () => null,
  LoadingState: () => null,
  SegmentedControl: () => null,
  Button: ({
    label,
    busy,
    busyLabel,
    onPress,
  }: {
    label: string
    busy?: boolean
    busyLabel?: string
    onPress?: () => void
  }) => <button onClick={onPress}>{busy && busyLabel ? busyLabel : label}</button>,
  TextField: ({
    label,
    value,
    onChangeText,
    error,
    editable,
  }: {
    label: string
    value?: string
    onChangeText?: (text: string) => void
    error?: string | null
    editable?: boolean
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        disabled={editable === false}
        value={value ?? ''}
        onChange={(event) => onChangeText?.(event.target.value)}
      />
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
}))

import {
  buildHostingPanelRows,
  HostingPanelRow,
  readHostingEditor,
} from './environment-detail-section'
import { useSyncedEditors } from './use-synced-editors'

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
      onRemoveHostname={vi.fn()}
      onManageHere={vi.fn()}
      {...props}
    />
  )
}

describe('HostingPanelRow save feedback', () => {
  it('says a missing hostname under the Hostname field', () => {
    drawRow({
      composeRoute: 'route-1',
      rowError: { field: 'hostname', message: 'Enter a hostname for this route.' },
    })
    const message = screen.getByRole('alert')
    expect(message.textContent).toBe('Enter a hostname for this route.')
    expect(message.parentElement?.textContent).toContain('Hostname')
  })

  it('says the outcome right after the save button', () => {
    drawRow({
      savedNote: { tone: 'ok', message: 'Saved. Let’s Encrypt was asked for a certificate.' },
    })
    const message = screen.getByText('Saved. Let’s Encrypt was asked for a certificate.')
    expect(message.previousElementSibling?.textContent).toBe('Save hosting')
  })

  it('says a failed save right after the save button, in place of an older note', () => {
    drawRow({
      rowError: { field: 'save', message: 'The server is offline.' },
      savedNote: { tone: 'ok', message: 'Saved.' },
    })
    const message = screen.getByRole('alert')
    expect(message.textContent).toBe('The server is offline.')
    expect(message.previousElementSibling?.textContent).toBe('Save hosting')
    expect(screen.queryByText('Saved.')).toBeNull()
  })

  it('says the certificate is part of the save while it runs', () => {
    drawRow({
      saving: true,
      editor: { ...readHostingEditor([]), hostnames: 'testing.example', getLetsEncrypt: true },
    })
    expect(screen.getByText('Saving and asking Let’s Encrypt…')).toBeTruthy()
  })

  it('does not claim a certificate the save will not ask for (no hostname yet)', () => {
    drawRow({ saving: true, editor: { ...readHostingEditor([]), getLetsEncrypt: true } })
    expect(screen.getByText('Saving…')).toBeTruthy()
  })
})

describe('the hosting form around a save', () => {
  type Seed = ReturnType<typeof readHostingEditor>
  const KEY = 'svc-1'
  const rowsWith = (seed: Partial<Seed>) => [
    { editorKey: KEY, seed: { ...readHostingEditor([]), ...seed } },
  ]
  let markSavedAtClick: ((keys: readonly string[]) => void) | null = null

  function Form({ rows }: Readonly<{ rows: ReturnType<typeof rowsWith> }>) {
    const { editors, setEditors, markSaved } = useSyncedEditors(rows, false)
    const editor = editors[KEY] ?? rows[0].seed
    return (
      <HostingPanelRow
        orgId="o1"
        composeServiceName="web"
        serviceContext={serviceContext}
        hostingId={null}
        expanded
        onToggleExpanded={vi.fn()}
        editor={editor}
        tlsOptions={[]}
        publicIps={[]}
        saving={false}
        disabled={false}
        onChange={(patch) =>
          setEditors((current) => ({ ...current, [KEY]: { ...editor, ...patch } }))
        }
        // The save handler keeps what it captured at click time, as the real one does.
        onSave={() => {
          markSavedAtClick = markSaved
        }}
        onRemoveHostname={vi.fn()}
        onManageHere={vi.fn()}
      />
    )
  }

  const hostnameField = () => screen.getByLabelText('Hostnames') as HTMLInputElement

  it('shows the saved hostname from the answer after a save, not an empty form', () => {
    const before = rowsWith({})
    const { rerender } = render(<Form rows={before} />)
    fireEvent.change(hostnameField(), { target: { value: 'testing.example' } })
    fireEvent.click(screen.getByText('Save hosting'))
    // The refetch lands with the saved hosting (the server filled in the port).
    rerender(<Form rows={rowsWith({ hostnames: 'testing.example', targetPort: '3000' })} />)
    act(() => markSavedAtClick?.([KEY]))
    expect(hostnameField().value).toBe('testing.example')
    expect(screen.getAllByText(/testing\.example · port 3000/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/no hostnames/)).toBeNull()
  })

  it('keeps unsaved typing when a newer answer arrives', () => {
    const { rerender } = render(<Form rows={rowsWith({})} />)
    fireEvent.change(hostnameField(), { target: { value: 'typing.example' } })
    rerender(<Form rows={rowsWith({ targetPort: '3000' })} />)
    expect(hostnameField().value).toBe('typing.example')
  })
})

describe('a hostname removed from the configuration file, before the next deploy', () => {
  const document = normalizeCompose({ services: { web: { image: 'nginx' } } })
  const madeFromFile = (adopted: boolean) =>
    ({
      id: 'h1',
      metadata: { composeOwned: true, composeRoute: 'shop.example /', composeAdopted: adopted },
      options: { hostnames: ['shop.example'] },
    }) as unknown as HostingRecord
  const rowsFor = (hostings: HostingRecord[]) =>
    buildHostingPanelRows({
      serviceNames: ['web'],
      services: [{ id: 'svc-1', composeServiceName: 'web' } as never],
      mergedCompose: document,
      overlayCompose: document,
      hostingsByService: { 'svc-1': hostings },
    })

  it('is listed as waiting for removal, not as an editable hostname of this screen', () => {
    const rows = rowsFor([madeFromFile(false)])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.source).toEqual({ kind: 'removing', handedBack: false })
    expect(rows[0]?.hostingId).toBe('h1')
  })

  it('keeps the empty form next to it, so a new hostname can still be added', () => {
    const rows = rowsFor([madeFromFile(false)])
    expect(rows[1]?.source).toEqual({ kind: 'panel' })
    expect(rows[1]?.hostingId).toBeNull()
  })

  it('says it goes back to this screen when the panel made it first', () => {
    expect(rowsFor([madeFromFile(true)])[0]?.source).toEqual({ kind: 'removing', handedBack: true })
  })

  it('keeps the ordinary form for a hostname this screen made', () => {
    const own = { id: 'p1', metadata: {}, options: { hostnames: ['blog.example'] } } as never
    const rows = rowsFor([own])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.source).toEqual({ kind: 'panel' })
  })

  it('shows the note and stays read-only until the deploy', () => {
    drawRow({ hostingId: 'h1', composeEditable: false, removalNote: pendingRemovalNote(false) })
    expect(
      screen.getByText(
        'This hostname will be removed on the next deploy. Until then it keeps being served and cannot be changed here.'
      )
    ).toBeTruthy()
    expect((screen.getByLabelText('Hostnames') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByText('Save hosting')).toBeNull()
    expect(screen.queryByText('Hosting variables')).toBeNull()
    expect(screen.getByText(PENDING_REMOVAL_CERTIFICATE_HINT)).toBeTruthy()
    expect(screen.queryByText(/tick the box below/)).toBeNull()
  })

  it('keeps the certificate actions of a hostname set in the shared file, but not of one being removed', () => {
    drawRow({ hostingId: 'h1', composeRoute: 'shop.example /', composeEditable: false })
    expect(screen.getByTestId('certificate-panel').dataset.disabled).toBe('false')
    cleanup()
    drawRow({ hostingId: 'h1', composeEditable: false, removalNote: pendingRemovalNote(false) })
    expect(screen.getByTestId('certificate-panel').dataset.disabled).toBe('true')
  })

  it('has no note on an ordinary hostname', () => {
    drawRow()
    expect(screen.queryByText(/removed on the next deploy/)).toBeNull()
    expect((screen.getByLabelText('Hostnames') as HTMLInputElement).disabled).toBe(false)
  })
})

describe('the certificate hint of a hostname managed on this screen', () => {
  it('mentions the Let’s Encrypt box only while the box is there', () => {
    drawRow()
    expect(
      screen.getByText(/tick the box below to get a free Let’s Encrypt certificate/)
    ).toBeTruthy()
    cleanup()
    drawRow({ editor: { ...readHostingEditor([]), hostnames: '' } })
    expect(screen.queryByText(/tick the box below/)).toBeNull()
    expect(screen.getByText(/enter a hostname and keep Self-signed picked/)).toBeTruthy()
  })
})
