// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
  sessionEmail: 'me@example.com' as string | undefined,
  invalidate: vi.fn(() => Promise.resolve()),
  onError: null as ((err: unknown) => void) | null,
}))

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  Linking: { openURL: state.openURL },
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  InlineNotice: ({ title }: { title: string }) => <p>{title}</p>,
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
  Checkbox: ({
    label,
    checked,
    onPress,
  }: {
    label: string
    checked: boolean
    onPress: () => void
  }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={onPress} />
      {label}
    </label>
  ),
  TextLink: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <a href="#terms" onClick={onPress}>
      {label}
    </a>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
    error,
  }: {
    label: string
    value: string
    onChangeText: (text: string) => void
    error?: string | null
  }) => (
    <>
      <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
      {error ? <p>{error}</p> : null}
    </>
  ),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: state.invalidate }),
}))
vi.mock('@/lib/queries/auth', () => ({
  useSessionQuery: () => ({ data: state.sessionEmail ? { email: state.sessionEmail } : null }),
}))
vi.mock('@/lib/query-client', () => ({
  useApiMutation: (options: { onError: (err: unknown) => void }) => {
    state.onError = options.onError
    return { mutate: state.mutate, isPending: false }
  },
  queryKeys: { org: () => ({ settings: { tlsSettings: ['tls-settings'] } }) },
}))
vi.mock('@/lib/instance-api', () => ({ saveOrgTlsSettings: vi.fn() }))

import { looksLikeEmail, TlsAcmeOptIn, TlsAcmeTermsRenewal } from './tls-acme-opt-in'

const TERMS = 'https://letsencrypt.org/documents/LE-SA-v1.5.pdf'
const optIn = (props: Partial<Parameters<typeof TlsAcmeOptIn>[0]> = {}) =>
  render(
    <TlsAcmeOptIn
      orgId="o1"
      savedEmail={null}
      termsUrl={TERMS}
      termsAcceptedAt={null}
      disabled={false}
      {...props}
    />
  )
const turnOn = () => screen.getByText("Turn On Let's Encrypt") as HTMLButtonElement
const accept = () =>
  fireEvent.click(
    screen.getByLabelText("I accept the Let's Encrypt Subscriber Agreement for this organization")
  )

describe('TlsAcmeOptIn', () => {
  beforeEach(() => {
    state.mutate.mockReset()
    state.openURL.mockClear()
    state.sessionEmail = 'me@example.com'
  })
  afterEach(cleanup)

  it('starts the contact as the signed-in address and waits for the terms', () => {
    optIn()
    expect((screen.getByLabelText('Certificate Contact Email') as HTMLInputElement).value).toBe(
      'me@example.com'
    )
    expect(turnOn().disabled).toBe(true)
    accept()
    expect(turnOn().disabled).toBe(false)
    fireEvent.click(turnOn())
    expect(state.mutate).toHaveBeenCalledWith({
      acmeEnabled: true,
      acmeContactEmail: 'me@example.com',
      acmeTermsAccepted: true,
      acmeTermsUrl: TERMS,
    })
  })

  it('prefers the address the organization already saved', () => {
    optIn({ savedEmail: 'ops@example.com' })
    expect((screen.getByLabelText('Certificate Contact Email') as HTMLInputElement).value).toBe(
      'ops@example.com'
    )
  })

  it('takes any address typed in, and holds the button for one that is not an address', () => {
    optIn()
    accept()
    const field = screen.getByLabelText('Certificate Contact Email')
    fireEvent.change(field, { target: { value: 'not an address' } })
    expect(turnOn().disabled).toBe(true)
    expect(screen.getByText('Enter one email address, such as ops@example.com.')).toBeTruthy()
    fireEvent.change(field, { target: { value: ' team@example.org ' } })
    fireEvent.click(turnOn())
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ acmeContactEmail: 'team@example.org', acmeTermsUrl: TERMS })
    )
  })

  it('opens the agreement', () => {
    optIn()
    fireEvent.click(screen.getByText("Read the Let's Encrypt Subscriber Agreement"))
    expect(state.openURL).toHaveBeenCalledWith(TERMS)
  })

  it('says so and stays off when the current terms could not be read', () => {
    optIn({ termsUrl: null })
    expect(
      screen.getByText(
        "Let's Encrypt could not be reached to read its current terms. Try again in a moment."
      )
    ).toBeTruthy()
    expect(turnOn().disabled).toBe(true)
  })

  it('reads the settings again after a refused save, so newer terms show', () => {
    optIn()
    act(() => state.onError?.(new Error("The Let's Encrypt terms changed.")))
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['tls-settings'] })
  })

  it('stays off while the settings are not loaded', () => {
    optIn({ disabled: true })
    accept()
    expect(turnOn().disabled).toBe(true)
  })
})

describe('looksLikeEmail', () => {
  it('accepts an address and refuses the rest', () => {
    expect(looksLikeEmail('ops@example.com')).toBe(true)
    for (const bad of ['', 'ops', 'ops@', '@example.com', 'ops@example', 'a b@example.com']) {
      expect(looksLikeEmail(bad)).toBe(false)
    }
  })
})

describe('TlsAcmeTermsRenewal', () => {
  beforeEach(() => state.mutate.mockReset())
  afterEach(cleanup)

  it('asks again for newer terms and records the exact agreement', () => {
    render(<TlsAcmeTermsRenewal orgId="o1" termsUrl={TERMS} changed disabled={false} />)
    expect(screen.getByText("Let's Encrypt Has New Terms")).toBeTruthy()
    const button = screen.getByText('Accept Terms') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    accept()
    fireEvent.click(button)
    expect(state.mutate).toHaveBeenCalledWith({ acmeTermsAccepted: true, acmeTermsUrl: TERMS })
  })

  it('asks for a first acceptance when none was recorded', () => {
    render(<TlsAcmeTermsRenewal orgId="o1" termsUrl={TERMS} changed={false} disabled={false} />)
    expect(screen.getByText("Accept the Let's Encrypt Terms")).toBeTruthy()
  })
})
