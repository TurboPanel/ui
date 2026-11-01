// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IngressAccountRecord } from '@/lib/instance-api'
import { CloudflareAccountCard } from './cloudflare-account-card'
import {
  AddAccountForm,
  CloudflareConnectionSection,
  EdgeGatePanel,
  EDGE_GATE_WARNING,
} from './cloudflare-connection-section'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  add: { run: vi.fn(), isPending: false },
  remove: { run: vi.fn(), isPending: false },
}))

const TOKEN = 'fake-token-value'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/auth-context', () => ({ useAuth: mocks.useAuth }))
vi.mock('./tunnel-section', () => ({ TunnelTokenPanel: () => <p>Run Token</p> }))
vi.mock('./tunnel-health-panel', () => ({ TunnelHealthPanel: () => <p>Tunnel Health</p> }))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceHostnames: () => ({ data: { hostnames: [] } }),
}))
vi.mock('@/lib/queries/ingress', () => ({
  useAddIngressAccount: () => mocks.add,
  useRemoveIngressAccount: () => mocks.remove,
  useRecheckIngressAccount: () => ({ run: vi.fn(), isPending: false }),
  useSetEdgeGate: () => ({ run: vi.fn(), isPending: false }),
  useIngressAccounts: () => ({ data: { accounts: [] }, isLoading: false, isError: false }),
  useIngressCapabilities: () => ({ data: undefined, isLoading: true }),
}))

const ACCOUNT: IngressAccountRecord = {
  id: 'a1',
  provider: 'cloudflare',
  label: 'Main',
  accountId: 'acc-1',
  zoneIds: ['z1'],
  scopes: {
    tunnels: true,
    dns: false,
    checkedAt: '2026-11-01T00:00:00Z',
    zones: [{ id: 'z1', name: 'example.com' }],
    expiresOn: null,
  },
  lastVerifiedAt: '2026-11-01T00:00:00Z',
  lastError: null,
  createdAt: '2026-11-01T00:00:00Z',
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Main' } })
  fireEvent.change(screen.getByLabelText('Token'), { target: { value: TOKEN } })
  fireEvent.click(screen.getByText('Connect Account'))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Cloudflare Connection', () => {
  it('renders the not-applicable note on High Availability', () => {
    mocks.useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    render(<CloudflareConnectionSection />)
    expect(screen.getByText(/Not applicable on this runtime/)).toBeTruthy()
    expect(screen.queryByText('Accounts')).toBeNull()
  })

  it('says the connector runs on the control plane host only', () => {
    mocks.useAuth.mockReturnValue({ controlPlaneRuntime: 'deno' })
    render(<CloudflareConnectionSection />)
    expect(screen.getByText(/runs on the control plane host only/)).toBeTruthy()
  })
})

describe('AddAccountForm', () => {
  it('clears the token on submit and never renders it', async () => {
    mocks.add.run.mockResolvedValue({
      ok: true,
      value: { ok: true, id: 'a1', preflight: { ok: true, checks: [] } },
    })
    render(<AddAccountForm />)
    fillAndSubmit()
    expect(mocks.add.run).toHaveBeenCalledWith({
      provider: 'cloudflare',
      label: 'Main',
      token: TOKEN,
    })
    expect(await screen.findByText('Account connected.')).toBeTruthy()
    expect((screen.getByLabelText('Token') as HTMLInputElement).value).toBe('')
    expect(document.body.innerHTML).not.toContain(TOKEN)
  })

  it('shows the failed check detail from a 422', async () => {
    mocks.add.run.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        error: 'The token cannot manage tunnels',
        preflight: {
          ok: false,
          checks: [
            { id: 'token-verify', ok: true, detail: 'Token is active.' },
            { id: 'scope-tunnels', ok: false, detail: 'Add Cloudflare Tunnel edit.' },
          ],
          accountId: null,
          zones: [],
          expiresOn: null,
        },
      },
    })
    render(<AddAccountForm />)
    fillAndSubmit()
    expect(await screen.findByText('Add Cloudflare Tunnel edit.')).toBeTruthy()
    expect(screen.getByText('Tunnel Scope')).toBeTruthy()
    expect(screen.getByText('The token cannot manage tunnels')).toBeTruthy()
    expect((screen.getByLabelText('Token') as HTMLInputElement).value).toBe('')
    expect(document.body.innerHTML).not.toContain(TOKEN)
  })
})

describe('CloudflareAccountCard', () => {
  it('shows both scopes as check rows', () => {
    render(<CloudflareAccountCard account={ACCOUNT} usedBy={[]} />)
    expect(screen.getByText('Tunnel Scope')).toBeTruthy()
    expect(screen.getByText('DNS Scope')).toBeTruthy()
    expect(screen.getByText('Cannot edit DNS records.')).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
  })

  it('disables Remove and names the hostnames while the account is in use', () => {
    render(<CloudflareAccountCard account={ACCOUNT} usedBy={['cp.example.com']} />)
    expect((screen.getByText('Remove') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Used by cp\.example\.com/)).toBeTruthy()
  })

  it('disables Remove after the control plane answers in-use', async () => {
    mocks.remove.run.mockResolvedValue({
      ok: true,
      value: { ok: false, error: 'in-use', hostnames: ['other.example.com'] },
    })
    render(<CloudflareAccountCard account={ACCOUNT} usedBy={[]} />)
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() =>
      expect((screen.getByText('Remove') as HTMLButtonElement).disabled).toBe(true)
    )
    expect(screen.getByText(/Used by other\.example\.com/)).toBeTruthy()
  })
})

describe('EdgeGatePanel', () => {
  it('warns before confirming and is disabled when forced closed', () => {
    render(
      <EdgeGatePanel
        loading={false}
        gate={{ open: false, confirmedAt: null, confirmedBy: null, forcedClosed: true }}
      />
    )
    expect(screen.getByText(new RegExp(EDGE_GATE_WARNING.slice(0, 40)))).toBeTruthy()
    expect((screen.getByText('Confirm Edge Go-Live') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/held off on this host/)).toBeTruthy()
  })
})
