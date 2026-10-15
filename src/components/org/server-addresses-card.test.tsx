// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerAddressesSaveError, type ServerAddressesView } from '@/lib/instance-api'
import { ADDRESSES_CERTIFICATE_PENDING } from '@/lib/server-addresses'
import { ServerAddressesCard } from './server-addresses-card'

const { useServerAddresses, useSaveServerAddresses, useCan, run } = vi.hoisted(() => ({
  useServerAddresses: vi.fn(),
  useSaveServerAddresses: vi.fn(),
  useCan: vi.fn(),
  run: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/lib/queries/servers', () => ({ useServerAddresses, useSaveServerAddresses }))
vi.mock('@/lib/query-client', () => ({ useCan }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))

type Props = Record<string, unknown> & { children?: unknown }

vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span>{label as string}</span>,
  Button: ({ label, accessibilityLabel, onPress, disabled }: Props) => (
    <button
      type="button"
      aria-label={(accessibilityLabel ?? label) as string}
      disabled={disabled as boolean}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children as never}</div>,
  Checkbox: ({ label, checked, onPress }: Props) => (
    <button type="button" role="checkbox" aria-checked={checked as boolean} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  FormField: ({ label, error, children }: Props) => (
    <div>
      <span>{label as string}</span>
      {children as never}
      {error ? <span>{error as string}</span> : null}
    </div>
  ),
  InlineNotice: ({ title, body }: Props) => (
    <div role="alert">
      {title as string}
      {body as string}
    </div>
  ),
  ModalSheet: ({ visible, title, children, footer }: Props) =>
    visible ? (
      <div data-testid="dialog">
        <h2>{title as string}</h2>
        {children as never}
        {footer as never}
      </div>
    ) : null,
  SectionPanel: ({ title, children }: Props) => (
    <section>
      <h1>{title as string}</h1>
      {children as never}
    </section>
  ),
  SegmentedControl: ({ options, onChange }: Props) => (
    <div>
      {(options as { value: string; label: string }[]).map((option) => (
        <button key={option.value} type="button" onClick={() => (onChange as (v: string) => void)(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
  TextField: ({ label, value, onChangeText, error, hint }: Props) => (
    <label>
      {label as string}
      <input
        aria-label={label as string}
        value={value as string}
        onChange={(event) => (onChangeText as (v: string) => void)(event.target.value)}
      />
      {error ? <span>{error as string}</span> : null}
      {hint ? <span>{hint as string}</span> : null}
    </label>
  ),
}))

const view: ServerAddressesView = {
  externalAccess: true,
  linuxHostname: 'omega',
  addressNeeded: false,
  addresses: [
    {
      scope: 'public',
      datacenterId: null,
      label: 'Public',
      saved: true,
      hostname: 'omega.example.com',
      addressV4: '203.0.113.7',
      addressV6: null,
      ports: { postgres: 25432, mysql: null },
      primary: false,
      main: true,
      effective: { v4: '203.0.113.7', v4Source: 'entry', v6: null, v6Source: null, host: 'omega.example.com', hostSource: 'hostname' },
    },
    {
      scope: 'datacenter',
      datacenterId: 'dc-1',
      label: 'Ashburn',
      saved: false,
      hostname: null,
      addressV4: null,
      addressV6: null,
      ports: {},
      primary: false,
      main: false,
      effective: { v4: '10.0.0.5', v4Source: 'pin', v6: null, v6Source: null, host: '10.0.0.5', hostSource: 'address' },
    },
  ],
}

function showCard(data: ServerAddressesView | null | undefined, canManage = true, isError = false) {
  useCan.mockReturnValue(canManage)
  useServerAddresses.mockReturnValue({ data, isError })
  return render(<ServerAddressesCard orgId="org-1" serverId="srv-1" />)
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  useSaveServerAddresses.mockReturnValue({ run, isPending: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ServerAddressesCard', () => {
  it('hides itself when the route is missing, still loading, or the viewer cannot manage', () => {
    showCard(null)
    expect(screen.queryByText('Addresses clients use')).toBeNull()
    cleanup()
    showCard(undefined, false)
    expect(screen.queryByText('Addresses clients use')).toBeNull()
    expect(useCan).toHaveBeenCalledWith('server', 'srv-1', 'organization:manage')
    expect(useServerAddresses).toHaveBeenCalledWith('org-1', 'srv-1', { enabled: false })
  })

  it('says so when the addresses could not load for another reason', () => {
    showCard(undefined, true, true)
    expect(screen.getByText('Could not load the addresses clients use.')).toBeTruthy()
  })

  it('shows one row per side with name, address, overridden ports and the main string', () => {
    showCard(view)
    expect(screen.getByText('Addresses clients use')).toBeTruthy()
    expect(screen.getByText('Public')).toBeTruthy()
    expect(screen.getByText('Datacenter Ashburn')).toBeTruthy()
    expect(screen.getByText('omega.example.com')).toBeTruthy()
    expect(screen.getByText('No DNS name yet')).toBeTruthy()
    expect(screen.getByText('Through a router: 203.0.113.7')).toBeTruthy()
    expect(screen.getByText("This server's own: 10.0.0.5 (its address in this datacenter)")).toBeTruthy()
    expect(screen.getByText('Postgres 25432, MySQL not forwarded')).toBeTruthy()
    expect(screen.getAllByText('Fills the main connection string')).toHaveLength(1)
  })

  it('prompts when external access is on and nothing gives clients a host', () => {
    showCard({ ...view, addressNeeded: true })
    expect(screen.getByRole('alert').textContent).toContain('Set the address clients use')
  })

  it('offers editing only to managers', () => {
    showCard(view, false)
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('validates in plain words before sending anything', () => {
    showCard(view)
    fireEvent.click(screen.getByLabelText('Edit Datacenter Ashburn'))
    expect(screen.getByText('Edit Datacenter Ashburn address')).toBeTruthy()
    type('DNS name clients use (optional)', 'omega')
    fireEvent.click(screen.getByText('A different address'))
    type('Postgres', '99999')
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText(/full DNS name with a dot/)).toBeTruthy()
    expect(screen.getByText(/Enter the IPv4 or IPv6 address/)).toBeTruthy()
    expect(screen.getByText(/from 1 to 65535/)).toBeTruthy()
    expect(run).not.toHaveBeenCalled()
  })

  it('saves every saved side plus the edited one and closes', async () => {
    run.mockResolvedValue({ ok: true, value: { ...view, certificateUpdatePending: false } })
    showCard(view)
    fireEvent.click(screen.getByLabelText('Edit Datacenter Ashburn'))
    type('DNS name clients use (optional)', 'Omega.DC1.example.com')
    fireEvent.click(screen.getByText('Use in the main connection string'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())
    expect(run).toHaveBeenCalledWith([
      expect.objectContaining({ scope: 'public', hostname: 'omega.example.com', primary: false }),
      expect.objectContaining({
        scope: 'datacenter',
        datacenterId: 'dc-1',
        hostname: 'omega.dc1.example.com',
        primary: true,
      }),
    ])
    expect(screen.queryByText(ADDRESSES_CERTIFICATE_PENDING)).toBeNull()
  })

  it('shows a 502 as saved with the certificate update still to come', async () => {
    run.mockResolvedValue({ ok: true, value: { ...view, certificateUpdatePending: true } })
    showCard(view)
    fireEvent.click(screen.getByLabelText('Edit Public'))
    expect(screen.getByText('Saved as not forwarded here.')).toBeTruthy()
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByText(ADDRESSES_CERTIFICATE_PENDING)).toBeTruthy())
  })

  it('maps a refusal to a plain message and keeps the dialog open', async () => {
    run.mockResolvedValue({
      ok: false,
      error: 'raw',
      cause: new ServerAddressesSaveError('/x', 400, { error: 'address_v4_invalid', index: 0 }),
    })
    showCard(view)
    fireEvent.click(screen.getByLabelText('Edit Datacenter Ashburn'))
    type('DNS name clients use (optional)', 'omega.dc1.example.com')
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(screen.getByText(/IPv4 address is not one clients can reach.*\(in the Public row\)/)).toBeTruthy(),
    )
    expect(screen.getByTestId('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('stays quiet on a refusal the sign-out seam already handled', async () => {
    run.mockResolvedValue({ ok: false, error: null, cause: new Error('HTTP 403') })
    showCard(view)
    fireEvent.click(screen.getByLabelText('Edit Public'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(screen.queryByText(/HTTP 403/)).toBeNull()
  })
})
