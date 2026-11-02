// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const NOW = Date.parse('2026-11-01T12:00:00Z')
const MINUTE = 60_000
const at = (ms: number) => new Date(NOW + ms).toISOString()
const future = () => at(59 * MINUTE + 30_000)

const issued = (expiresAt: string) => ({
  ok: true,
  value: {
    ticketId: 't',
    expiresAt,
    licenseToken: 'tok',
    licenseArg: 'arg',
    installCommand: 'curl -fsSL https://example.test | TURBOPANEL_LICENSE=arg sh',
  },
})

const unusedKey = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1',
  name: 'edge-9',
  createdAt: '2026-11-01T00:00:00Z',
  revocable: true,
  boundServer: null,
  expiresAt: future(),
  tier: null,
  ...overrides,
})

// Only the clock is faked: setTimeout stays real so waitFor keeps working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
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

  it('counts the expiry down by the minute and drops Revoke once the token has expired', async () => {
    hooks.issue.mockResolvedValue(issued(future()))
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Issue Re-Enroll Token'))
    await waitFor(() => expect(screen.getByText('Expires in 59 minutes')).toBeTruthy())
    act(() => {
      vi.advanceTimersByTime(MINUTE)
    })
    expect(screen.getByText('Expires in 58 minutes')).toBeTruthy()
    expect(screen.getByText('Revoke')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(58 * MINUTE)
    })
    expect(screen.getByText('Expires in less than a minute')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(MINUTE)
    })
    expect(screen.getByText('Expired')).toBeTruthy()
    expect(screen.queryByText('Revoke')).toBeNull()
  })

  it('shows a token that is already expired as Expired with no Revoke', async () => {
    hooks.issue.mockResolvedValue(issued(at(-MINUTE)))
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Issue Re-Enroll Token'))
    await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy())
    expect(screen.queryByText('Revoke')).toBeNull()
    expect(screen.getByText('Copy Command')).toBeTruthy()
  })

  it('stops the minute timer when the panel unmounts', async () => {
    hooks.issue.mockResolvedValue(issued(future()))
    const { unmount } = render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Issue Re-Enroll Token'))
    await waitFor(() => expect(screen.getByText('Expires in 59 minutes')).toBeTruthy())
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the failure when a key cannot be reissued, and no command', async () => {
    hooks.licenses = [unusedKey()]
    hooks.reissue.mockResolvedValue({ ok: false, error: 'Not allowed', cause: new Error('x') })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Reissue'))
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(screen.queryByText(/New command for/)).toBeNull()
  })

  it('falls back to a plain message when the reissue failure has no text', async () => {
    hooks.licenses = [unusedKey()]
    hooks.reissue.mockResolvedValue({ ok: false, error: '', cause: new Error('x') })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Reissue'))
    await waitFor(() => expect(screen.getByText('Failed to reissue the key')).toBeTruthy())
  })

  it('burns a key and hides the command that was shown for it', async () => {
    hooks.licenses = [unusedKey()]
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
    hooks.burn.mockResolvedValue({ ok: true, value: { ok: true } })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Reissue'))
    await waitFor(() => expect(screen.getByText(/TURBOPANEL_LICENSE=newarg sh/)).toBeTruthy())
    fireEvent.click(screen.getByText('Burn'))
    await waitFor(() => expect(screen.queryByText(/TURBOPANEL_LICENSE=newarg sh/)).toBeNull())
    expect(hooks.burn).toHaveBeenCalledWith('k1')
  })

  it('shows the failure when a key cannot be burned', async () => {
    hooks.licenses = [unusedKey()]
    hooks.burn.mockResolvedValue({ ok: false, error: 'Key is in use', cause: new Error('x') })
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    fireEvent.click(screen.getByText('Burn'))
    await waitFor(() => expect(screen.getByText('Key is in use')).toBeTruthy())
  })

  it('offers no Burn for a key that cannot be revoked, and marks an expired key', () => {
    hooks.licenses = [unusedKey({ revocable: false, expired: true })]
    render(<ServerReenrollTokenPanel orgId="o" serverId="s" />)
    expect(screen.queryByText('Burn')).toBeNull()
    expect(screen.getByText(/edge-9 · — · Expired/)).toBeTruthy()
  })
})
