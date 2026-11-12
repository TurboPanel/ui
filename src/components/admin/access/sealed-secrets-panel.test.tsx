// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SealedSecretsServer } from '@/lib/instance-api'
import { CLEAR_SEALING_KEY_REFUSED_CONNECTED } from '@/lib/sealed-secrets'
import { SealedSecretsPanel } from './sealed-secrets-panel'

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  query: { isLoading: false, isError: false, error: null as unknown, data: undefined as unknown },
}))

/** Stands in for the type-the-name dialog: one press confirms with the name already typed. */
function StubTypeNameDeleteButton({
  verb,
  thing,
  name,
  onConfirm,
}: Readonly<{
  verb: string
  thing: string
  name: string
  onConfirm: (typed: string) => Promise<unknown>
}>) {
  const [result, setResult] = useState<string | null>(null)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onConfirm(name).then(
            (value) => setResult(`resolved ${String(value)}`),
            (err: unknown) => setResult(err instanceof Error ? err.message : 'failed')
          )
        }}
      >
        {`${verb} ${thing}`}
      </button>
      {result ? <output>{result}</output> : null}
    </div>
  )
}

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => ({
  ...(await import('./access-ui-stub')).accessUiStub,
  MonoText: ({ children }: Readonly<{ children?: string }>) => <code>{children}</code>,
  TypeNameDeleteButton: StubTypeNameDeleteButton,
}))
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/admin', () => ({
  useSealedSecrets: () => mocks.query,
  useClearServerSealingKey: () => ({ run: mocks.run }),
}))

function server(over: Partial<SealedSecretsServer> = {}): SealedSecretsServer {
  return {
    id: 'srv-1',
    name: 'web-1',
    hostname: 'web.example.com',
    organizationId: 'org-1',
    isConnected: false,
    advertisesSealedSecrets: false,
    sealingKey: { kid: 'kid-abc', reportedAt: '2026-11-05T10:00:00Z' },
    plaintextSecretsAt: null,
    receivesPlaintext: false,
    ...over,
  }
}

function showServers(servers: SealedSecretsServer[]) {
  mocks.query = {
    isLoading: false,
    isError: false,
    error: null,
    data: { ok: true, receivingPlaintext: 0, servers },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SealedSecretsPanel', () => {
  it('lists each server with its key id or None, the status badge and Clear only with a key', () => {
    showServers([
      server(),
      server({
        id: 'srv-2',
        name: null,
        hostname: 'db.example.com',
        sealingKey: null,
        receivesPlaintext: true,
      }),
    ])
    render(<SealedSecretsPanel />)
    expect(screen.getByText('Sealed Secrets')).toBeTruthy()
    expect(screen.getByText('web-1')).toBeTruthy()
    expect(screen.getByText('kid-abc')).toBeTruthy()
    expect(screen.getByText('Sealed')).toBeTruthy()
    expect(screen.getByText('db.example.com')).toBeTruthy()
    expect(screen.getByText('None')).toBeTruthy()
    expect(screen.getByText('Unsealed')).toBeTruthy()
    expect(screen.getAllByText('Clear Sealing Key')).toHaveLength(1)
  })

  it('says so when there are no servers', () => {
    showServers([])
    render(<SealedSecretsPanel />)
    expect(screen.getByText('No servers yet.')).toBeTruthy()
  })

  it('shows loading and a failed read', () => {
    mocks.query = { isLoading: true, isError: false, error: null, data: undefined }
    const { unmount } = render(<SealedSecretsPanel />)
    expect(screen.getByText('Loading')).toBeTruthy()
    unmount()
    mocks.query = { isLoading: false, isError: true, error: new Error('boom'), data: undefined }
    render(<SealedSecretsPanel />)
    expect(screen.getByText(/boom|Failed to load the sealed-secrets list/)).toBeTruthy()
  })

  it('clears with the typed name and closes on success', async () => {
    showServers([server()])
    mocks.run.mockResolvedValue({ ok: true, value: { ok: true, cleared: true } })
    render(<SealedSecretsPanel />)
    fireEvent.click(screen.getByText('Clear Sealing Key'))
    await waitFor(() => expect(screen.getByText('resolved true')).toBeTruthy())
    expect(mocks.run).toHaveBeenCalledWith({ serverId: 'srv-1', confirmName: 'web-1' })
  })

  it('keeps the dialog open when re-authentication takes over', async () => {
    showServers([server()])
    mocks.run.mockResolvedValue({ ok: false, error: null })
    render(<SealedSecretsPanel />)
    fireEvent.click(screen.getByText('Clear Sealing Key'))
    await waitFor(() => expect(screen.getByText('resolved false')).toBeTruthy())
  })

  it('explains a refusal while a current daemon is connected', async () => {
    showServers([server()])
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'HTTP 409: daemon_seals_secrets',
      cause: new Error('/x failed: HTTP 409: daemon_seals_secrets'),
    })
    render(<SealedSecretsPanel />)
    fireEvent.click(screen.getByText('Clear Sealing Key'))
    await waitFor(() => expect(screen.getByText(CLEAR_SEALING_KEY_REFUSED_CONNECTED)).toBeTruthy())
  })
})
