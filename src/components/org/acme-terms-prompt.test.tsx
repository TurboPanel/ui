// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrgTlsSettings } from '@/lib/instance-api'

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  canManage: true,
  session: { userId: 'u1', email: 'me@example.com', role: 'member' } as object | null,
  settings: undefined as unknown,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalSheet: ({
    title,
    children,
    footer,
  }: {
    title: string
    children?: unknown
    footer?: unknown
  }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
      {footer as never}
    </section>
  ),
}))
vi.mock('@/components/org/tls-acme-opt-in', () => ({
  TermsAgreement: ({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) => (
    <label>
      <input type="checkbox" checked={accepted} onChange={onToggle} />
      Accept the agreement
    </label>
  ),
  useSaveTlsSettings: () => ({
    mutation: { mutate: state.mutate, isPending: false },
    error: null,
    setError: vi.fn(),
  }),
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: state.session }) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.settings }),
}))
vi.mock('@/lib/query-client', () => ({
  useCan: () => state.canManage,
  queryKeys: { org: () => ({ settings: { tlsSettings: ['tls-settings'] } }) },
}))
vi.mock('@/lib/instance-api', () => ({ fetchOrgTlsSettings: vi.fn() }))

import { AcmeTermsPrompt, needsTermsPrompt } from './acme-terms-prompt'

const OLD = 'https://letsencrypt.org/documents/LE-SA-v1.5.pdf'
const NEW = 'https://letsencrypt.org/documents/LE-SA-v1.6.pdf'

function settings(over: Partial<OrgTlsSettings> = {}): OrgTlsSettings {
  return {
    acmeEnabled: true,
    acmeContactEmail: 'ops@example.com',
    acmeTermsAcceptedAt: '2026-11-01T00:00:00.000Z',
    acmeAcceptedTermsUrl: OLD,
    acmeTermsUrl: NEW,
    acmeTermsChanged: true,
    ...over,
  }
}

describe('needsTermsPrompt', () => {
  it('asks when Let’s Encrypt is on and the accepted agreement is older, or none was kept', () => {
    expect(needsTermsPrompt(settings())).toBe(true)
    expect(
      needsTermsPrompt(settings({ acmeTermsChanged: false, acmeAcceptedTermsUrl: null }))
    ).toBe(true)
  })

  it('does not ask when terms are current, it is off, or the current terms are unknown', () => {
    expect(needsTermsPrompt(settings({ acmeTermsChanged: false, acmeAcceptedTermsUrl: NEW }))).toBe(
      false
    )
    expect(needsTermsPrompt(settings({ acmeEnabled: false }))).toBe(false)
    expect(needsTermsPrompt(settings({ acmeTermsUrl: null }))).toBe(false)
    expect(needsTermsPrompt(undefined)).toBe(false)
  })
})

describe('AcmeTermsPrompt', () => {
  beforeEach(() => {
    state.mutate.mockReset()
    state.canManage = true
    state.session = { userId: 'u1', email: 'me@example.com', role: 'member' }
    state.settings = settings()
  })
  afterEach(cleanup)

  it('asks a manager to accept the exact new agreement', () => {
    render(<AcmeTermsPrompt orgId="o1" />)
    expect(screen.getByText("Let's Encrypt Has New Terms")).toBeTruthy()
    const accept = screen.getByText('Accept Terms') as HTMLButtonElement
    expect(accept.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Accept the agreement'))
    fireEvent.click(accept)
    expect(state.mutate).toHaveBeenCalledWith({ acmeTermsAccepted: true, acmeTermsUrl: NEW })
  })

  it('Later hides it for this sign-in only; a new sign-in asks again', () => {
    const view = render(<AcmeTermsPrompt orgId="o1" />)
    act(() => {
      fireEvent.click(screen.getByText('Later'))
    })
    expect(screen.queryByText("Let's Encrypt Has New Terms")).toBeNull()
    view.unmount()
    render(<AcmeTermsPrompt orgId="o1" />)
    expect(screen.queryByText("Let's Encrypt Has New Terms")).toBeNull()
    cleanup()
    state.session = { userId: 'u1', email: 'me@example.com', role: 'member' }
    render(<AcmeTermsPrompt orgId="o1" />)
    expect(screen.getByText("Let's Encrypt Has New Terms")).toBeTruthy()
  })

  it('shows nothing to people who cannot manage the organization', () => {
    state.canManage = false
    const { container } = render(<AcmeTermsPrompt orgId="o1" />)
    expect(container.innerHTML).toBe('')
  })
})
