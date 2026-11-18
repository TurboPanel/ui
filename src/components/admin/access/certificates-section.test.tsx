// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord, UploadedCertificateRecord } from '@/lib/instance-api'
import type { DaemonCapabilitiesStatus } from '@/lib/instance-certificates'
import { AttachmentEditor } from './certificates-section'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => {
  const { accessUiStub } = await import('./access-ui-stub')
  return { ...accessUiStub, Checkbox: () => null }
})
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/admin', () => ({
  useAttachInstanceCertificate: () => ({ run: vi.fn(), isPending: false }),
  useInstanceAcmeSettings: () => ({}),
  useInstanceCertificates: () => ({}),
  useInstanceDaemon: () => ({}),
  useInstanceHostnames: () => ({}),
  useSaveInstanceAcmeSettings: () => ({}),
  useUploadInstanceCertificate: () => ({}),
}))

const certificate = {
  id: 'c1',
  label: 'Edge pair',
  dnsNames: ['app.example.net'],
  hostnames: [],
} as unknown as UploadedCertificateRecord
const hostnames = [{ id: 'h1', host: 'app.example.net' }] as unknown as InstanceHostnameRecord[]

afterEach(cleanup)

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
      "This host's daemon isn't connected, so this source can't be chosen right now.",
    ],
    ['error', "Couldn't read this host's daemon, so this source can't be chosen right now."],
  ] as const)('disables Save attachments and explains while %s', (status, reason) => {
    expect(renderEditor(status).disabled).toBe(true)
    expect(screen.getByText(reason)).toBeTruthy()
  })
})
