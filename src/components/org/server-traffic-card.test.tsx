// @vitest-environment happy-dom
import { useState } from 'react'
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
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({
    data: { servers: [{ id: 'srv-unnamed', name: null, hostname: 'db-2.example.net' }] },
  }),
}))
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
  ConfirmButton: ({ label, confirmLabel, onConfirm, disabled }: Props) => {
    const [armed, setArmed] = useState(false)
    return armed ? (
      <button type="button" disabled={disabled as boolean} onClick={onConfirm as () => void}>
        {confirmLabel as string}
      </button>
    ) : (
      <button type="button" disabled={disabled as boolean} onClick={() => setArmed(true)}>
        {label as string}
      </button>
    )
  },
  LoadingState: ({ label }: Props) => <div role="progressbar">{label as string}</div>,
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

  it('names a server without a display name by its hostname', () => {
    const peer = map.peers[0]!
    show(true, { ...map, peers: [{ ...peer, serverId: 'srv-unnamed', name: null }] })
    expect(screen.getByText('db-2.example.net')).toBeTruthy()
    expect(screen.queryByText('Unnamed server')).toBeNull()
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

  it('asks before making a network first, then lists the renumbered networks', async () => {
    choose.mockResolvedValue({
      ok: true,
      value: { ok: true, changes: [{ datacenterId: 'back', before: 10, after: 20 }] },
    })
    show()
    fireEvent.click(screen.getByText('Use this one first'))
    expect(choose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Use it first'))
    expect(choose).toHaveBeenCalledWith('lan')
    expect(await screen.findByText('Backhaul: priority 10 is now 20')).toBeTruthy()
  })

  it('asks before a network stops being used', () => {
    show()
    fireEvent.click(screen.getAllByText('Stop using this network')[1])
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Stop using it'))
    expect(update).toHaveBeenCalledWith({ options: { trusted: false } })
  })

  it('says every change applies to every server', () => {
    show()
    expect(
      screen.getAllByText('This applies to every server in the organization.').length
    ).toBeGreaterThan(0)
  })

  it('blocks a second press while a change is saving', () => {
    useUpdateDatacenter.mockReturnValue({ run: update, isPending: true, actionError: null })
    show()
    for (const button of screen.getAllByText('Stop using this network')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(
      (screen.getByLabelText('Save priority for Office LAN') as HTMLButtonElement).disabled
    ).toBe(true)
    fireEvent.click(screen.getByLabelText('Save priority for Office LAN'))
    expect(update).not.toHaveBeenCalled()
  })

  it('shows one message when two networks share the first place', () => {
    useCan.mockReturnValue(true)
    useDatacenters.mockReturnValue({
      data: {
        datacenters: [
          { id: 'a', name: 'Alpha', priority: 10, trusted: true, options: null },
          { id: 'b', name: 'Beta', priority: 10, trusted: true, options: null },
        ],
      },
      isError: false,
    })
    useServerTrafficMap.mockReturnValue({ data: { ...map, peers: [] }, isError: false })
    render(<ServerTrafficCard orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText('Tied for first')).toHaveLength(1)
    expect(screen.getAllByText('Same priority as another')).toHaveLength(1)
    expect(screen.queryByText('Used first')).toBeNull()
  })

  it('names later places in words', () => {
    show()
    expect(screen.getByText('Second')).toBeTruthy()
  })

  it('shows an error when either request fails', () => {
    useCan.mockReturnValue(true)
    useDatacenters.mockReturnValue({ data: { datacenters }, isError: false })
    useServerTrafficMap.mockReturnValue({ data: undefined, isError: true })
    render(<ServerTrafficCard orgId="org-1" serverId="srv-1" />)
    expect(screen.getByRole('alert').textContent).toContain('Could not load the networks.')
    expect(screen.queryByText(/shares no network/)).toBeNull()
  })

  it('shows a loading line, not an empty message, while loading', () => {
    useCan.mockReturnValue(true)
    useDatacenters.mockReturnValue({ data: undefined, isError: false, isPending: true })
    useServerTrafficMap.mockReturnValue({ data: undefined, isError: false, isPending: true })
    render(<ServerTrafficCard orgId="org-1" serverId="srv-1" />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText(/No networks are set up yet/)).toBeNull()
  })

  it('says when only the first servers are shown', () => {
    show(true, { ...map, truncated: true })
    expect(screen.getByText('Only the first 100 servers are shown.')).toBeTruthy()
  })

  it('shows read-only numbers without manage rights', () => {
    show(false)
    expect(screen.queryByText('Use this one first')).toBeNull()
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
