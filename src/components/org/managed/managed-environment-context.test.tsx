// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandStatus } from '@/lib/instance-api'
import {
  ManagedCommandsProvider,
  useManagedEnvironment,
  type ManagedEnvironmentValue,
} from './managed-environment-context'

const h = vi.hoisted(() => ({
  entries: [] as readonly { serverId: string; commandId: string }[],
  batch: { data: undefined as unknown, isError: false },
  ctx: null as ManagedEnvironmentValue | null,
}))

vi.mock('@/lib/queries/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries/commands')>()
  return {
    ...actual,
    useCommandsBatch: (_orgId: string, entries: typeof h.entries) => {
      h.entries = entries
      return h.batch
    },
  }
})
vi.mock('@/lib/queries/environments', () => ({
  useEnvironment: () => ({ data: { environment: { serverId: 'srv-env' } } }),
}))
vi.mock('@/lib/queries/managed', () => ({
  useEnvironmentManaged: () => ({ data: { managed: { serverId: 'srv-detail' } } }),
}))

function Probe() {
  const ctx = useManagedEnvironment()
  useEffect(() => {
    h.ctx = ctx
  })
  return null
}

let client: QueryClient
function renderProvider() {
  const tree = () => (
    <QueryClientProvider client={client}>
      <ManagedCommandsProvider orgId="o" environmentId="e">
        <Probe />
      </ManagedCommandsProvider>
    </QueryClientProvider>
  )
  const view = render(tree())
  return { rerender: () => view.rerender(tree()) }
}

function answered(status: CommandStatus) {
  return [{ id: 'cmd-1', serverId: 'srv-member', status }]
}

beforeEach(() => {
  client = new QueryClient()
  h.entries = []
  h.batch = { data: undefined, isError: false }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ManagedCommandsProvider', () => {
  it('tracks a command on the server that took it', () => {
    renderProvider()
    act(() => h.ctx?.registerCommand('cmd-1', 'stop', 'srv-member'))
    expect(h.entries).toEqual([{ serverId: 'srv-member', commandId: 'cmd-1' }])
    expect(h.ctx?.inFlight).toBe(true)
  })

  it.each(['failed', 'cancelled'] as const)(
    'refreshes the database screens when a command ends %s',
    (status) => {
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      const view = renderProvider()
      act(() => h.ctx?.registerCommand('cmd-1', 'stop', 'srv-member'))
      h.batch = { data: answered(status), isError: false }
      act(() => view.rerender())
      expect(invalidate).toHaveBeenCalled()
      expect(h.entries).toEqual([])
      expect(h.ctx?.inFlight).toBe(false)
    }
  )

  it('keeps the actions locked while status reads fail, until the command expires', () => {
    vi.useFakeTimers()
    const view = renderProvider()
    act(() => h.ctx?.registerCommand('cmd-1', 'stop', 'srv-member'))
    h.batch = { data: undefined, isError: true }
    act(() => view.rerender())
    expect(h.ctx?.inFlight).toBe(true)
    act(() => vi.advanceTimersByTime(119_000))
    expect(h.ctx?.inFlight).toBe(true)
    act(() => vi.advanceTimersByTime(2_000))
    expect(h.entries).toEqual([])
    expect(h.ctx?.inFlight).toBe(false)
  })

  it('trusts an earlier answer that says the command still runs when a later read fails', () => {
    const view = renderProvider()
    act(() => h.ctx?.registerCommand('cmd-1', 'stop', 'srv-member'))
    h.batch = { data: answered('running'), isError: true }
    act(() => view.rerender())
    expect(h.ctx?.inFlight).toBe(true)
  })
})
