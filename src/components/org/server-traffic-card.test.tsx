// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerTrafficMap } from '@/lib/instance-api'
import { ServerTrafficCard } from './server-traffic-card'

const {
  useDatacenters,
  useServerTrafficMap,
  useUpdateDatacenter,
  useChooseServerTrafficNetwork,
  useCan,
  update,
  choose,
} = vi.hoisted(() => ({
  useDatacenters: vi.fn(),
  useServerTrafficMap: vi.fn(),
  useUpdateDatacenter: vi.fn(),
  useChooseServerTrafficNetwork: vi.fn(),
  useCan: vi.fn(),
  update: vi.fn(),
  choose: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/lib/queries/topology', () => ({
  useDatacenters,
  useServerTrafficMap,
  useUpdateDatacenter,
  useChooseServerTrafficNetwork,
}))
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
  Checkbox: ({ label, accessibilityLabel, checked, onPress }: Props) => (
    <button
      type="button"
      role="checkbox"
      aria-label={(accessibilityLabel ?? label) as string}
      aria-checked={checked as boolean}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
  InlineNotice: ({ title }: Props) => <div role="alert">{title as string}</div>,
  SectionPanel: ({ title, hint, children }: Props) => (
    <section>
      <h1>{title as string}</h1>
      <p>{hint as string}</p>
      {children as never}
    </section>
  ),
  TextField: ({ label, accessibilityLabel, value, onChangeText, error }: Props) => (
    <label>
      {label as string}
      <input
        aria-label={(accessibilityLabel ?? label) as string}
        value={value as string}
        onChange={(event) => (onChangeText as (v: string) => void)(event.target.value)}
      />
      {error ? <span>{error as string}</span> : null}
    </label>
  ),
}))

const datacenters = [
  { id: 'lan', name: 'Office LAN', priority: 100, trusted: true, options: null },
  { id: 'back', name: 'Backhaul', priority: 10, trusted: true, options: { priority: 10 } },
  {
    id: 'shared',
    name: 'Provider network',
    priority: 100,
    trusted: false,
    options: { trusted: false },
  },
]

const map: ServerTrafficMap = {
  ok: true,
  generatedAt: '2026-10-21T00:00:00Z',
  serverId: 'srv-1',
  truncated: false,
  nics: [
    {
      name: 'eth1',
      link: 'down',
      defaultRoute: false,
      addresses: [{ address: '10.9.0.2', datacenterId: 'back' }],
    },
  ],
  peers: [
    {
      serverId: 'srv-2',
      name: 'beta',
      chosenDatacenterId: 'lan',
      sharedNetworks: [
        {
          datacenterId: 'back',
          name: 'Backhaul',
          priority: 10,
          trusted: true,
          state: 'link_down',
          localAddress: '10.9.0.2',
          peerAddress: '10.9.0.3',
          localInterface: 'eth1',
          peerInterface: 'eth1',
          localLink: 'down',
          peerLink: 'up',
        },
        {
          datacenterId: 'lan',
          name: 'Office LAN',
          priority: 100,
          trusted: true,
          state: 'chosen',
          localAddress: '10.0.0.2',
          peerAddress: '10.0.0.3',
          localInterface: 'eth0',
          peerInterface: 'eth0',
          localLink: 'up',
          peerLink: 'up',
        },
      ],
    },
  ],
}

function show(canManage = true, mapData: ServerTrafficMap | undefined = map) {
  useCan.mockReturnValue(canManage)
  useDatacenters.mockReturnValue({ data: { datacenters }, isError: false })
  useServerTrafficMap.mockReturnValue({ data: mapData, isError: false })
  return render(<ServerTrafficCard orgId="org-1" serverId="srv-1" />)
}

beforeEach(() => {
  update.mockResolvedValue({ ok: true, value: { ok: true } })
  choose.mockResolvedValue({ ok: true, value: { ok: true, changes: [] } })
  useUpdateDatacenter.mockReturnValue({ run: update, isPending: false, actionError: null })
  useChooseServerTrafficNetwork.mockReturnValue({
    run: choose,
    isPending: false,
    actionError: null,
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ServerTrafficCard', () => {
  it('lists used networks lowest number first and marks the first one', () => {
    show()
    const titles = screen.getAllByText(/^(Backhaul|Office LAN)$/).map((el) => el.textContent)
    expect(titles.indexOf('Backhaul')).toBeLessThan(titles.indexOf('Office LAN'))
    expect(screen.getByText('Used first')).toBeTruthy()
    expect(screen.getAllByText('Not used').length).toBeGreaterThan(0)
  })

  it('shows which network carries traffic and which one is down', () => {
    show()
    expect(screen.getByText('Using Office LAN')).toBeTruthy()
    expect(screen.getByText('Carrying traffic')).toBeTruthy()
    expect(screen.getByText('Down, last resort only')).toBeTruthy()
    expect(screen.getByText('The network card is down on this server.')).toBeTruthy()
    expect(screen.getByText('Carrying traffic to 1 server from here')).toBeTruthy()
    expect(screen.getByText('eth1')).toBeTruthy()
  })

  it('saves a new priority number', () => {
    show()
    fireEvent.change(screen.getByLabelText('Priority for Office LAN'), { target: { value: '5' } })
    fireEvent.click(screen.getByLabelText('Save priority for Office LAN'))
    expect(update).toHaveBeenCalledWith({ options: { priority: 5 } })
  })

  it('refuses a number out of range without calling the server', () => {
    show()
    fireEvent.change(screen.getByLabelText('Priority for Office LAN'), {
      target: { value: '5000' },
    })
    fireEvent.click(screen.getByLabelText('Save priority for Office LAN'))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText(/between 0 and 1000/)).toBeTruthy()
  })

  it('uses a network first and stops using one', () => {
    show()
    fireEvent.click(screen.getByLabelText('Use Office LAN first'))
    expect(choose).toHaveBeenCalledWith('lan')
    fireEvent.click(screen.getByLabelText('Use Office LAN for server traffic'))
    expect(update).toHaveBeenCalledWith({ options: { trusted: false } })
  })

  it('shows read-only numbers without manage rights', () => {
    show(false)
    expect(screen.queryByLabelText('Use Office LAN first')).toBeNull()
    expect(screen.getByText('Priority 100')).toBeTruthy()
  })

  it('says so when no network exists', () => {
    useCan.mockReturnValue(true)
    useDatacenters.mockReturnValue({ data: { datacenters: [] }, isError: false })
    useServerTrafficMap.mockReturnValue({ data: undefined, isError: false })
    render(<ServerTrafficCard orgId="org-1" serverId="srv-1" />)
    expect(screen.getByText(/No networks are set up yet/)).toBeTruthy()
  })
})
