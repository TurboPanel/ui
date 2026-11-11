// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TunnelDnsRecordExistsError,
  TunnelDnsReplaceIncompleteError,
  type ExistingDnsRecord,
} from '@/lib/instance-api'
import { NetworkTunnelHostnames } from './network-tunnel-hostnames'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
type AddResult = { ok: true; value: unknown } | { ok: false; cause: unknown }

const state = vi.hoisted(() => ({
  add: vi.fn(async (_body: unknown): Promise<AddResult> => ({ ok: false, cause: null })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span>{label as string}</span>,
  Button: ({ label, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  ConfirmButton: ({ label, onConfirm }: Props) => (
    <button type="button" onClick={onConfirm as () => void}>
      {label as string}
    </button>
  ),
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  MonoText: ({ children }: Props) => <code>{children}</code>,
  TextField: ({ value, onChangeText, accessibilityLabel }: Props) => (
    <input
      aria-label={accessibilityLabel as string}
      value={value as string}
      onChange={(e) => (onChangeText as (v: string) => void)(e.target.value)}
    />
  ),
  TypeNameDeleteButton: () => null,
}))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useTunnelHostnames: () => ({ data: { hostnames: [] }, isError: false, isLoading: false }),
  useAddTunnelHostname: () => ({ run: state.add, isPending: false }),
  useRemoveTunnelHostname: () => ({ run: vi.fn(), isPending: false }),
}))

const recA: ExistingDnsRecord = { id: 'rec-a', type: 'A', content: '192.0.2.10', proxied: true }
const recAaaa: ExistingDnsRecord = {
  id: 'rec-6',
  type: 'AAAA',
  content: '2001:db8::10',
  proxied: false,
}

function exists(replaceable = true, message = 'The name already has DNS records.') {
  return new TunnelDnsRecordExistsError(message, 'app.example.com', [recA, recAaaa], replaceable)
}

async function addName() {
  render(<NetworkTunnelHostnames orgId="o1" tunnelId="t1" />)
  fireEvent.change(screen.getByLabelText('Tunnel hostname'), {
    target: { value: 'app.example.com' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add Hostname' }))
  })
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

beforeEach(() => {
  state.add.mockReset()
})
afterEach(cleanup)

describe('replacing the DNS records that hold a tunnel hostname', () => {
  it('sends each record back as it was shown, not only its id', async () => {
    state.add.mockResolvedValueOnce({ ok: false, cause: exists() })
    state.add.mockResolvedValueOnce({
      ok: true,
      value: { hostname: { dns: { status: 'created' } } },
    })
    await addName()
    expect(screen.getByText('A 192.0.2.10 (proxied)')).toBeTruthy()
    await press('Replace Records')
    expect(state.add).toHaveBeenLastCalledWith({
      hostname: 'app.example.com',
      replaceDnsRecords: [
        { id: 'rec-a', type: 'A', content: '192.0.2.10' },
        { id: 'rec-6', type: 'AAAA', content: '2001:db8::10' },
      ],
    })
  })

  it('lists too many records without offering to replace them, and says why', async () => {
    state.add.mockResolvedValueOnce({
      ok: false,
      cause: exists(false, 'That is more than 10 records: remove them at your DNS provider first.'),
    })
    await addName()
    expect(screen.queryByRole('button', { name: 'Replace Records' })).toBeNull()
    expect(screen.getByText(/too many to replace here/)).toBeTruthy()
    expect(screen.queryByText(/remove them at your DNS provider first/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('keeps the records on screen when the replacement fails for another reason', async () => {
    state.add.mockResolvedValueOnce({ ok: false, cause: exists() })
    state.add.mockResolvedValueOnce({
      ok: false,
      cause: new Error('HTTP 502: provider_unavailable — The tunnel provider did not answer.'),
    })
    await addName()
    await press('Replace Records')
    expect(screen.getByRole('button', { name: 'Replace Records' })).toBeTruthy()
    expect(screen.getByText('The tunnel provider did not answer.')).toBeTruthy()
  })

  it('names the records already removed when the replacement failed partway', async () => {
    state.add.mockResolvedValueOnce({ ok: false, cause: exists() })
    state.add.mockResolvedValueOnce({
      ok: false,
      cause: new TunnelDnsReplaceIncompleteError('Only partly replaced.', 'app.example.com', [
        { type: 'AAAA', content: '2001:db8::10', proxied: false },
      ]),
    })
    await addName()
    await press('Replace Records')
    expect(screen.queryByRole('button', { name: 'Replace Records' })).toBeNull()
    expect(screen.getByText('DNS Records Removed')).toBeTruthy()
    expect(screen.getByText('AAAA 2001:db8::10')).toBeTruthy()
    // A keystroke does not wipe the only list of what was deleted.
    fireEvent.change(screen.getByLabelText('Tunnel hostname'), {
      target: { value: 'app.example.co' },
    })
    expect(screen.getByText('DNS Records Removed')).toBeTruthy()
    await press('Dismiss')
    expect(screen.queryByText('DNS Records Removed')).toBeNull()
  })

  it('shows the control plane sentence when a partial failure names no records', async () => {
    state.add.mockResolvedValueOnce({ ok: false, cause: exists() })
    state.add.mockResolvedValueOnce({
      ok: false,
      cause: new TunnelDnsReplaceIncompleteError('Only partly replaced.', 'app.example.com', []),
    })
    await addName()
    await press('Replace Records')
    expect(screen.getByText('Only partly replaced.')).toBeTruthy()
    expect(screen.queryByText('DNS Records Removed')).toBeNull()
  })
})
