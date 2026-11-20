// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DnsCertificateRateLimitedError } from '@/lib/instance-api'
import { HostingNameCertificates } from './hosting-name-certificates'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
type Option = { value: string; label: string; detail?: string | null; disabled?: boolean }
type Result = { ok: true } | { ok: false; cause: unknown }

const state = vi.hoisted(() => ({
  hosting: null as unknown,
  retry: vi.fn(async (_id: string): Promise<Result> => ({ ok: true })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span>{label as string}</span>,
  Button: ({ label, onPress, accessibilityLabel }: Props) => (
    <button
      type="button"
      aria-label={(accessibilityLabel as string | undefined) ?? (label as string)}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  InlineNotice: ({ title, body, actions }: Props) => (
    <div role="note">
      <p>{title as string}</p>
      {body ? <p>{body as string}</p> : null}
      {actions as ReactNode}
    </div>
  ),
  Select: ({ accessibilityLabel, value, options, onChange, placeholder, disabled }: Props) => (
    <select
      disabled={Boolean(disabled)}
      aria-label={accessibilityLabel as string}
      data-placeholder={placeholder as string}
      value={(value as string | null) ?? ''}
      onChange={(event) => (onChange as (v: string | null) => void)(event.target.value || null)}
    >
      <option value="">{placeholder as string}</option>
      {(options as Option[]).map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
          {option.detail ? ` (${option.detail})` : ''}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/lib/queries/hosting-certificate', () => ({
  useHostingCertificate: () => ({ data: state.hosting ? { hosting: state.hosting } : undefined }),
}))
vi.mock('@/lib/queries/dns-certificates', () => ({
  useRetryDnsCertificate: () => ({ run: state.retry, isPending: false }),
}))

const options = [
  { certificate: 'self_signed', available: true },
  { certificate: 'letsencrypt_http', available: true },
  {
    certificate: 'letsencrypt_dns',
    available: false,
    reason: 'Not available on this panel yet.',
  },
  { certificate: 'library', tlsId: 'lib-1', available: true, label: 'Shop wildcard' },
]

function nameOf(hostname: string, certificate = 'letsencrypt_http', tlsId: string | null = null) {
  return {
    hostname,
    certificate,
    tlsId,
    certificateOptions: { default: 'letsencrypt_http', options },
  }
}

const library = [
  {
    id: 'lib-1',
    organizationId: 'o1',
    name: 'Shop wildcard',
    source: 'upload',
    metadata: { dnsNames: ['*.example.net'], status: 'ready' },
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dns-1',
    organizationId: 'o1',
    name: null,
    source: 'lets_encrypt',
    metadata: {
      dnsNames: ['b.example.net'],
      status: 'failed',
      acme: {
        stage: 'backoff',
        lastError: 'DNS timed out.',
        challengeType: 'dns-01',
        managedBy: 'server',
      },
    },
    createdAt: '',
    updatedAt: '',
  },
] as never

function draw(edits = {}, onEditsChange = vi.fn(), locked = false) {
  render(
    <HostingNameCertificates
      orgId="o1"
      hostingId="h1"
      library={library}
      edits={edits}
      locked={locked}
      onEditsChange={onEditsChange}
    />
  )
  return onEditsChange
}

beforeEach(() => {
  state.hosting = {
    certificate: { state: 'secure' },
    tunnels: [{ hostname: 'a.example.net', tunnelOnly: true, originVerified: true }],
    names: [nameOf('a.example.net'), nameOf('b.example.net', 'letsencrypt_dns', 'dns-1')],
  }
  state.retry.mockClear()
})
afterEach(cleanup)

describe('HostingNameCertificates', () => {
  it('draws nothing until the hosting has names', () => {
    state.hosting = null
    draw()
    expect(screen.queryByText('Certificates')).toBeNull()
  })

  it('shows a picker for each name, with reach and verification', () => {
    draw()
    expect(screen.getByLabelText('Certificate for a.example.net')).toBeTruthy()
    expect(screen.getByLabelText('Certificate for b.example.net')).toBeTruthy()
    expect(screen.getByText('Tunnel Only')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('Direct')).toBeTruthy()
  })

  it('says why an option is not available', () => {
    draw()
    const unavailable = screen.getAllByText(/Not available on this panel yet\./)[0]!
    expect((unavailable as HTMLOptionElement).disabled).toBe(true)
  })

  it('keeps a pick as an edit and says it changes on save', () => {
    const onEditsChange = draw()
    fireEvent.change(screen.getByLabelText('Certificate for a.example.net'), {
      target: { value: 'self_signed' },
    })
    expect(onEditsChange).toHaveBeenCalledWith({
      'a.example.net': { certificate: 'self_signed', tlsId: null },
    })
  })

  it('says a pending edit changes when saved, instead of the old state', () => {
    draw({ 'a.example.net': { certificate: 'self_signed', tlsId: null } })
    expect(screen.getByText('Changes when you save.')).toBeTruthy()
  })

  it('shows the same-for-all picker as Mixed when names differ, and warns', () => {
    draw()
    expect(
      screen.getByLabelText('Same certificate for all names').getAttribute('data-placeholder')
    ).toBe('Mixed')
    expect(screen.getByText('Different Certificates')).toBeTruthy()
  })

  it('gives every name the same certificate from the shared picker', () => {
    const onEditsChange = draw()
    fireEvent.change(screen.getByLabelText('Same certificate for all names'), {
      target: { value: 'self_signed' },
    })
    expect(onEditsChange).toHaveBeenCalledWith({
      'a.example.net': { certificate: 'self_signed', tlsId: null },
      'b.example.net': { certificate: 'self_signed', tlsId: null },
    })
  })

  it('offers a library certificate to the other names it covers, and applies it on yes', () => {
    const onEditsChange = draw()
    fireEvent.change(screen.getByLabelText('Certificate for a.example.net'), {
      target: { value: 'library:lib-1' },
    })
    expect(screen.getByText('This certificate also covers b.example.net.')).toBeTruthy()
    fireEvent.click(screen.getByText('Use It For Those Names'))
    expect(onEditsChange).toHaveBeenLastCalledWith({
      'b.example.net': { certificate: 'library', tlsId: 'lib-1' },
    })
    expect(screen.queryByText(/also covers/)).toBeNull()
  })

  it('lets the person decline the offer', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Certificate for a.example.net'), {
      target: { value: 'library:lib-1' },
    })
    fireEvent.click(screen.getByText('No Thanks'))
    expect(screen.queryByText(/also covers/)).toBeNull()
  })

  it('shows a failed order with a way to try again', async () => {
    draw()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText(/DNS timed out\./)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Try again for b.example.net'))
    })
    expect(state.retry).toHaveBeenCalledWith('dns-1')
  })

  it('tells when the certificate authority asked for a wait', async () => {
    state.retry.mockResolvedValueOnce({
      ok: false,
      cause: new DnsCertificateRateLimitedError('2030-01-02T03:04:05.000Z'),
    })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Try again for b.example.net'))
    })
    expect(screen.getByRole('alert').textContent).toContain('asked for a wait')
  })

  it('shows another retry failure in plain words', async () => {
    state.retry.mockResolvedValueOnce({ ok: false, cause: new Error('') })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Try again for b.example.net'))
    })
    expect(screen.getByRole('alert').textContent).toBe('Could not try again.')
  })

  it('does not offer Try Again for an order with no retry route', () => {
    state.hosting = {
      certificate: { state: 'secure' },
      names: [nameOf('b.example.net', 'letsencrypt_http', 'http-1')],
    }
    draw()
    expect(screen.queryByLabelText('Try again for b.example.net')).toBeNull()
  })

  it('shows a www name with the reach of its partner name', () => {
    state.hosting = {
      certificate: { state: 'secure' },
      tunnels: [{ hostname: 'example.net', tunnelOnly: true, originVerified: true }],
      names: [nameOf('example.net'), nameOf('www.example.net')],
    }
    draw()
    expect(screen.getAllByText('Tunnel Only')).toHaveLength(2)
  })

  it('disables the pickers while locked', () => {
    draw({}, vi.fn(), true)
    expect(
      (screen.getByLabelText('Certificate for a.example.net') as HTMLSelectElement).disabled
    ).toBe(true)
  })
})
