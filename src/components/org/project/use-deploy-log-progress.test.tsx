// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandProgress, CommandRecord } from '@/lib/instance-api'
import { useDeployLogProgress, type DeployLogRef } from './use-deploy-log-progress'

const batch = vi.hoisted(() => ({
  records: undefined as Partial<CommandRecord>[] | undefined,
  calls: [] as { entries: readonly { serverId: string; commandId: string }[]; enabled: boolean | undefined }[],
}))

vi.mock('@/lib/queries/commands', () => ({
  useCommandRecordsBatch: (
    _orgId: string,
    entries: readonly { serverId: string; commandId: string }[],
    options?: { enabled?: boolean },
  ) => {
    batch.calls.push({ entries, enabled: options?.enabled })
    return { data: options?.enabled ? batch.records : undefined }
  },
}))

afterEach(cleanup)

function plan(current: string | null, state: 'running' | 'done' = 'running'): CommandProgress {
  return {
    version: 1,
    current,
    updatedAt: '2026-10-12T10:00:00Z',
    steps: [{ id: 'build', label: 'Build', state }],
  }
}

const LOG_A: DeployLogRef = { serverId: 'srv-1', commandId: 'cmd-a' }
const LOG_B: DeployLogRef = { serverId: 'srv-1', commandId: 'cmd-b' }

type Props = { openLog: DeployLogRef | null; polled: CommandProgress | null; terminal: boolean }

function mount(initial: Props) {
  return renderHook((props: Props) => useDeployLogProgress('org-1', props.openLog, props.polled, props.terminal), {
    initialProps: initial,
  })
}

/** The entries the hook asked the final-record read for, ignoring calls made while it was off. */
function requested() {
  return batch.calls.filter((call) => call.enabled)
}

describe('useDeployLogProgress', () => {
  beforeEach(() => {
    batch.records = undefined
    batch.calls = []
  })

  it('shows the polled plan and holds it when the poll stops carrying one', () => {
    const live = plan('build')
    const { result, rerender } = mount({ openLog: LOG_A, polled: live, terminal: false })
    expect(result.current).toBe(live)
    rerender({ openLog: LOG_A, polled: null, terminal: false })
    expect(result.current).toBe(live)
    expect(requested()).toHaveLength(0)
  })

  it('reads the full record once the command is terminal, and keeps the held plan when that record has none', () => {
    const live = plan('build')
    const { result, rerender } = mount({ openLog: LOG_A, polled: live, terminal: false })
    batch.records = [{ id: 'cmd-a', progress: null }]
    rerender({ openLog: LOG_A, polled: null, terminal: true })
    expect(result.current).toBe(live)
    const asked = requested()
    expect(asked.length).toBeGreaterThan(0)
    expect(asked[0]?.entries).toEqual([{ serverId: 'srv-1', commandId: 'cmd-a' }])
    // The same entries object on every render: one query key, so one request.
    for (const call of asked) expect(call.entries).toBe(asked[0]?.entries)

    const finalised = plan(null, 'done')
    batch.records = [{ id: 'cmd-a', progress: finalised }]
    rerender({ openLog: LOG_A, polled: null, terminal: true })
    expect(result.current).toBe(finalised)
  })

  it('ignores a record for another command', () => {
    const live = plan('build')
    const { result, rerender } = mount({ openLog: LOG_A, polled: live, terminal: false })
    batch.records = [{ id: 'cmd-z', progress: plan(null, 'done') }]
    rerender({ openLog: LOG_A, polled: null, terminal: true })
    expect(result.current).toBe(live)
  })

  it('does not ask for the record while the deploy is still running', () => {
    mount({ openLog: LOG_A, polled: plan('build'), terminal: false })
    expect(requested()).toHaveLength(0)
    expect(batch.calls.every((call) => call.entries.length === 0)).toBe(true)
  })

  it('clears the held plan when the log moves to another command', () => {
    const live = plan('build')
    const { result, rerender } = mount({ openLog: LOG_A, polled: live, terminal: false })
    rerender({ openLog: LOG_B, polled: null, terminal: false })
    expect(result.current).toBeNull()
    rerender({ openLog: LOG_A, polled: null, terminal: false })
    expect(result.current).toBeNull()
  })

  it('clears the held plan when the log closes', () => {
    const live = plan('build')
    const { result, rerender } = mount({ openLog: LOG_A, polled: live, terminal: true })
    rerender({ openLog: null, polled: null, terminal: true })
    expect(result.current).toBeNull()
    rerender({ openLog: LOG_A, polled: null, terminal: true })
    expect(result.current).toBeNull()
  })
})
