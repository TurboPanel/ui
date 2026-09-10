// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandLogResponse } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  EMPTY_COMMAND_LOG_SNAPSHOT,
  useCommandLog,
} from '@/lib/queries/execution-logs'

const { fetchCommandLog } = vi.hoisted(() => ({
  fetchCommandLog: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchCommandLog,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

function logEvent(sequence: number, message: string): string {
  return `${JSON.stringify({
    commandId: 'cmd-1',
    sequence,
    timestamp: '2026-08-21T12:00:00.000Z',
    stream: 'stdout',
    phase: 'build',
    message,
  })}\n`
}

function response(
  overrides: Partial<CommandLogResponse> = {},
): CommandLogResponse {
  return {
    ok: true,
    text: '',
    nextSeq: 0,
    sealed: false,
    truncated: false,
    exists: true,
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCommandLog identity and enablement', () => {
  it('starts a fresh cursor when the command id changes on the same hook', async () => {
    fetchCommandLog.mockImplementation(
      async (_serverId: string, commandId: string) => {
        if (commandId === 'cmd-1') {
          return response({ text: logEvent(1, 'first'), nextSeq: 4 })
        }
        return response({ text: logEvent(1, 'second'), nextSeq: 1 })
      },
    )

    const { result, rerender } = renderHook(
      ({ commandId }: { commandId: string }) =>
        useCommandLog('org-1', 'srv-a', commandId, { poll: false }),
      {
        wrapper: createWrapper(),
        initialProps: { commandId: 'cmd-1' },
      },
    )

    await waitFor(() => {
      expect(result.current.snapshot.lines).toHaveLength(1)
    })
    expect(fetchCommandLog).toHaveBeenCalledWith('srv-a', 'cmd-1', {
      from: 0,
    })
    expect(result.current.snapshot.nextSeq).toBe(4)

    rerender({ commandId: 'cmd-2' })
    await waitFor(() => {
      expect(result.current.snapshot.lines[0]?.message).toBe('second')
    })
    expect(fetchCommandLog).toHaveBeenCalledWith('srv-a', 'cmd-2', {
      from: 0,
    })
    expect(result.current.snapshot.nextSeq).toBe(1)
  })

  it('stays idle without an organization id', () => {
    const { result } = renderHook(
      () => useCommandLog('', 'srv-a', 'cmd-1', { enabled: true }),
      { wrapper: createWrapper() },
    )
    expect(result.current.state).toBe('idle')
    expect(result.current.snapshot).toEqual(EMPTY_COMMAND_LOG_SNAPSHOT)
    expect(fetchCommandLog).not.toHaveBeenCalled()
  })
})
