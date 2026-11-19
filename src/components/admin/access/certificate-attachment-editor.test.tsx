// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord, UploadedCertificateRecord } from '@/lib/instance-api'
import type { DaemonCapabilitiesStatus } from '@/lib/instance-certificates'
import { AttachmentEditor } from './certificate-attachment-editor'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => {
  const { accessUiStub } = await import('./access-ui-stub')
  return {
    ...accessUiStub,
    Checkbox: (props: {
      checked: boolean
      disabled?: boolean
      label: string
      onPress: () => void
    }) => (
      <label>
        <input
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onPress}
        />
        {props.label}
      </label>
    ),
  }
})
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
const mocks = vi.hoisted(() => ({ run: vi.fn() }))

vi.mock('@/lib/queries/admin', () => ({
  useAttachInstanceCertificate: () => ({ run: mocks.run, isPending: false }),
}))

const certificate = {
  id: 'c1',
  label: 'Edge pair',
  dnsNames: ['app.example.net'],
  hostnames: [],
} as unknown as UploadedCertificateRecord
const hostnames = [
  { id: 'h1', host: 'app.example.net' },
  { id: 'h2', host: 'other.example.org' },
] as unknown as InstanceHostnameRecord[]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderEditor(status?: DaemonCapabilitiesStatus) {
  render(
    <AttachmentEditor certificate={certificate} hostnames={hostnames} capabilitiesStatus={status} />
  )
  return screen.getByRole('button', { name: 'Save attachments' }) as HTMLButtonElement
}

describe('AttachmentEditor daemon gating', () => {
  it('enables Save attachments once the daemon is ready', () => {
    expect(renderEditor('ready').disabled).toBe(false)
  })

  it('stays enabled when the status is not supplied', () => {
    expect(renderEditor().disabled).toBe(false)
  })

  it.each([
    ['loading', "Checking this host's daemon."],
    [
      'disconnected',
      "This host's daemon isn't connected, so attachments can't be saved right now.",
    ],
    ['error', "Couldn't read this host's daemon, so attachments can't be saved right now."],
    [
      'not-applicable',
      'Certificates are only attached on a self-hosted control plane, so attachments are not available here.',
    ],
  ] as const)('disables Save attachments and explains while %s', (status, reason) => {
    expect(renderEditor(status).disabled).toBe(true)
    expect(screen.getByText(reason)).toBeTruthy()
  })
})

describe('AttachmentEditor saving', () => {
  it('saves the chosen hostnames and shows a refusal', async () => {
    mocks.run.mockResolvedValue({ ok: false, error: 'Refused' })
    renderEditor('ready')
    fireEvent.click(screen.getByLabelText('app.example.net'))
    fireEvent.click(screen.getByRole('button', { name: 'Save attachments' }))
    await waitFor(() => expect(screen.getByText('Refused')).toBeTruthy())
    expect(mocks.run).toHaveBeenCalledWith({ id: 'c1', hosts: ['app.example.net'] })
  })

  it('shows a fallback message when the refusal has no text and clears a choice', async () => {
    mocks.run.mockResolvedValue({ ok: false })
    renderEditor('ready')
    const box = screen.getByLabelText('app.example.net')
    fireEvent.click(box)
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Save attachments' }))
    await waitFor(() => expect(screen.getByText('Failed to update attachments')).toBeTruthy())
    expect(mocks.run).toHaveBeenCalledWith({ id: 'c1', hosts: [] })
  })

  it('says why a hostname the pair does not cover cannot be attached', () => {
    renderEditor('ready')
    expect(screen.getByText('This pair does not cover this hostname.')).toBeTruthy()
  })

  it('explains an empty hostname list and keeps Save disabled', () => {
    render(<AttachmentEditor certificate={certificate} hostnames={[]} />)
    expect(screen.getByText(/Add a hostname on the Hostnames page/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Save attachments' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})
