// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerReenrollTokenPanel } from './server-reenroll-token-panel'

const hooks = vi.hoisted(() => ({
  can: vi.fn(() => true),
  issue: vi.fn(),
  revoke: vi.fn(),
  reissue: vi.fn(),
  burn: vi.fn(),
  licenses: [] as unknown[],
}))

const mutation = (run: ReturnType<typeof vi.fn>) => ({
  run,
  isPending: false,
  variables: undefined,
})

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/lib/query-client', () => ({ useCan: () => hooks.can() }))
vi.mock('@/lib/queries/servers', () => ({
  useIssueServerReenrollTicket: () => mutation(hooks.issue),
  useRevokeServerReenrollTickets: () => mutation(hooks.revoke),
  useReissueLicenseTicket: () => mutation(hooks.reissue),
  useDeleteLicense: () => mutation(hooks.burn),
  useOrgLicenses: () => ({ data: { licenses: hooks.licenses } }),
}))
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, pageCopy: {}, detailTitle: {} },
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  ConfirmButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{label}</button>
  ),
  CopyButton: ({ label }: { label: string }) => <button>{label}</button>,
  MonoText: ({ children }: { children: string }) => <code>{children}</code>,
  SectionPanel: ({ title, children }: { title: string; children: unknown }) => (
    <section>
      <h3>{title}</h3>
      {children as never}
    </section>
  ),
}))

const future = () => new Date(Date.now() + 59 * 60_000 + 30_000).toISOString()

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  hooks.can.mockReturnValue(true)
  hooks.licenses = []
})

describe('ServerReenrollTokenPanel', () => {
  it('renders nothing for someone who is not an owner (the gate is the owner permission)', () => {
    hooks.can.mockReturnValue(false)
    const { container } = render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    expect(container.textContent).toBe('')
  })

  it('renders the issue button, help text and an empty key list', () => {
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    expect(screen.getByText('Issue Re-Enroll Token')).toBeTruthy()
    expect(screen.getByText(/works once and stops working after one hour/)).toBeTruthy()
    expect(screen.getByText('Keys Minted Before')).toBeTruthy()
    expect(screen.getByText('No unused keys.')).toBeTruthy()
  })

  it('shows the command, the expiry and Revoke after issuing, then clears on revoke', async () => {
    hooks.issue.mockResolvedValue({
      ok: true,
      value: {
        ticketId: 't',
        expiresAt: future(),
        licenseToken: 'tok',
        licenseArg: 'arg',
        installCommand: 'curl -fsSL https://example.test | TURBOPANEL_LICENSE=arg sh',
      },
    })
    hooks.revoke.mockResolvedValue({ ok: true, value: { ok: true, revoked: 1 } })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Issue Re-Enroll Token'))
    await waitFor(() => expect(screen.getByText(/TURBOPANEL_LICENSE=arg sh/)).toBeTruthy())
    expect(screen.getByText('Expires in 59 minutes')).toBeTruthy()
    expect(screen.getByText('Copy Command')).toBeTruthy()
    fireEvent.click(screen.getByText('Revoke'))
    await waitFor(() => expect(screen.queryByText(/TURBOPANEL_LICENSE=arg sh/)).toBeNull())
    expect(hooks.revoke).toHaveBeenCalledTimes(1)
  })

  it('shows the failure beside the button and no command', async () => {
    hooks.issue.mockResolvedValue({ ok: false, error: 'Not allowed', cause: new Error('x') })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Issue Re-Enroll Token'))
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(screen.queryByText('Revoke')).toBeNull()
  })

  it('lists unused keys with Reissue and Burn, and shows a reissued command', async () => {
    hooks.licenses = [
      {
        id: 'k1',
        name: 'edge-9',
        createdAt: '2026-11-01T00:00:00Z',
        revocable: true,
        boundServer: null,
        expiresAt: future(),
        tier: null,
      },
    ]
    hooks.reissue.mockResolvedValue({
      ok: true,
      value: {
        licenseId: 'k1',
        joinId: 'j',
        joinExpiresAt: future(),
        licenseToken: 't',
        licenseArg: 'newarg',
        installCommand: 'run TURBOPANEL_LICENSE=newarg sh',
      },
    })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    expect(screen.getByText(/edge-9/)).toBeTruthy()
    expect(screen.getByText('Burn')).toBeTruthy()
    fireEvent.click(screen.getByText('Reissue'))
    await waitFor(() => expect(screen.getByText(/TURBOPANEL_LICENSE=newarg sh/)).toBeTruthy())
    expect(hooks.reissue).toHaveBeenCalledWith('k1')
  })
})
