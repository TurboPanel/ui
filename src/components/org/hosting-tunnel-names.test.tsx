// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostingTunnelNames } from './hosting-tunnel-names'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
type Option = { value: string; label: string }

const state = vi.hoisted(() => ({
  hosting: null as unknown,
  tunnels: [] as unknown[],
  hostingError: false,
  tunnelsError: false,
  add: vi.fn(async (_body: unknown) => ({ ok: true }) as { ok: boolean; cause?: unknown }),
  addTunnelId: '',
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
  Select: ({ accessibilityLabel, value, options, onChange }: Props) => (
    <select
      aria-label={accessibilityLabel as string}
      value={value as string}
      onChange={(event) => (onChange as (v: string | null) => void)(event.target.value || null)}
    >
      {(options as Option[]).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/components/org/network/network-tunnel-hostnames', () => ({
  ExistingRecords: () => null,
  RemovedRecords: () => null,
}))
vi.mock('@/lib/queries/hosting-certificate', () => ({
  useHostingCertificate: () => ({
    data: state.hosting ? { hosting: state.hosting } : undefined,
    isError: state.hostingError,
  }),
}))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useTunnels: () => ({ data: { tunnels: state.tunnels }, isError: state.tunnelsError }),
  useAddTunnelHostname: (_org: string, tunnelId: string) => {
    state.addTunnelId = tunnelId
    return { run: state.add, isPending: false }
  },
}))

const tunnel = (id: string, name: string, servers: string[]) => ({
  id,
  name,
  status: 'active',
  carryingServerIds: servers,
  portals: [],
})

function names(...hostnames: string[]) {
  return hostnames.map((hostname) => ({ hostname }))
}

function draw(serverId: string | null = 'server-a', canManage = true) {
  return render(
    <HostingTunnelNames
      orgId="o1"
      hostingId="h1"
      serverId={serverId}
      locked={false}
      canManage={canManage}
    />
  )
}

beforeEach(() => {
  state.hosting = { names: names('app.example.net'), tunnels: [] }
  state.tunnels = []
  state.hostingError = false
  state.tunnelsError = false
  state.add.mockClear()
  state.add.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('HostingTunnelNames', () => {
  it('shows which tunnel carries a name and offers nothing for it', () => {
    state.hosting = {
      names: names('app.example.net'),
      tunnels: [{ hostname: 'app.example.net', tunnelId: 't1', tunnelName: 'Edge' }],
    }
    state.tunnels = [tunnel('t1', 'Edge', ['server-a'])]
    draw()
    expect(screen.getByText('Carried by Edge')).toBeTruthy()
    expect(screen.queryByText('Serve Through Tunnel')).toBeNull()
  })

  it('adds the name to the only tunnel that runs on the server', async () => {
    state.tunnels = [tunnel('t1', 'Edge', ['server-a']), tunnel('t2', 'Elsewhere', ['server-z'])]
    draw()
    expect(screen.queryByLabelText('Tunnel for app.example.net')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Serve Through Tunnel: app.example.net'))
    })
    expect(state.addTunnelId).toBe('t1')
    expect(state.add).toHaveBeenCalledWith({ hostname: 'app.example.net' })
  })

  it('lets the person pick between several tunnels on the server', async () => {
    state.tunnels = [tunnel('t1', 'Edge', ['server-a']), tunnel('t2', 'Backup', ['server-a'])]
    draw()
    fireEvent.change(screen.getByLabelText('Tunnel for app.example.net'), {
      target: { value: 't2' },
    })
    expect(state.addTunnelId).toBe('t2')
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Serve Through Tunnel: app.example.net'))
    })
    expect(state.add).toHaveBeenCalledWith({ hostname: 'app.example.net' })
  })

  it('says why when no tunnel runs on the server', () => {
    state.tunnels = [tunnel('t2', 'Elsewhere', ['server-z'])]
    draw()
    expect(screen.queryByText('Serve Through Tunnel')).toBeNull()
    expect(screen.getByText(/No tunnel runs on this environment/)).toBeTruthy()
  })

  it('shows the refusal wording when the name is already on a tunnel', async () => {
    state.tunnels = [tunnel('t1', 'Edge', ['server-a'])]
    state.add.mockResolvedValue({ ok: false, cause: new Error('HTTP 409: hostname_in_use') })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Serve Through Tunnel: app.example.net'))
    })
    expect(screen.getByRole('alert').textContent).toBe('This hostname is already on a tunnel.')
  })

  it('says the person lacks permission when the call is a 403', async () => {
    state.tunnels = [tunnel('t1', 'Edge', ['server-a'])]
    state.add.mockResolvedValue({ ok: false, cause: new Error('HTTP 403: forbidden') })
    draw()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Serve Through Tunnel: app.example.net'))
    })
    expect(screen.getByRole('alert').textContent).toMatch(/do not have permission/)
  })

  it('shows only which tunnel carries a name to a person who cannot manage', () => {
    state.hosting = {
      names: names('app.example.net', 'other.example.net'),
      tunnels: [{ hostname: 'app.example.net', tunnelId: 't1', tunnelName: 'Edge' }],
    }
    state.tunnels = []
    draw('server-a', false)
    expect(screen.getByText('Carried by Edge')).toBeTruthy()
    expect(screen.queryByText('Serve Through Tunnel')).toBeNull()
    expect(screen.queryByText(/No tunnel exists yet/)).toBeNull()
    expect(screen.queryByText('other.example.net')).toBeNull()
  })

  it('shows nothing to a person who cannot manage when no tunnel carries a name', () => {
    const { container } = draw('server-a', false)
    expect(container.textContent).toBe('')
  })

  it('shows an inline error when the site or the tunnels fail to load', () => {
    state.hostingError = true
    draw()
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load the tunnels/)
    cleanup()
    state.hostingError = false
    state.tunnelsError = true
    draw()
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load the tunnels/)
  })
})
