// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/lib/instance-api'
import { createAppQueryClient, setForbiddenHandler } from '@/lib/query-client'
import { useUpgradeActiveRun } from '@/lib/queries/admin'
import { upgradeStatusQueryEnabled } from '@/lib/upgrade-status-query'

const { fetchUpgradeActiveRun } = vi.hoisted(() => ({
  fetchUpgradeActiveRun: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, fetchUpgradeActiveRun }
})

const member: SessionInfo = {
  userId: 'user-1',
  email: 'member@example.com',
  role: 'user',
  is2faEnabled: false,
}

function wrapper(client = createAppQueryClient()) {
  return function Wrap({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('upgradeStatusQueryEnabled', () => {
  it('is closed for a signed-in non-admin', () => {
    expect(upgradeStatusQueryEnabled({ session: member, canQuery: true })).toBe(false)
    expect(upgradeStatusQueryEnabled({
      session: { ...member, role: 'admin' },
      canQuery: true,
    })).toBe(true)
    expect(upgradeStatusQueryEnabled({
      session: { ...member, role: 'admin' },
      canQuery: false,
    })).toBe(false)
  })
})

describe('non-admin upgrade status', () => {
  it('does not request admin run status or invoke the forbidden handler', async () => {
    fetchUpgradeActiveRun.mockRejectedValue(new Error('GET /instance/updates/run failed: HTTP 403'))
    const forbidden = vi.fn()
    setForbiddenHandler(forbidden)
    const enabled = upgradeStatusQueryEnabled({ session: member, canQuery: true })
    const { result } = renderHook(() => useUpgradeActiveRun({ enabled }), {
      wrapper: wrapper(),
    })
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle')
    })
    expect(fetchUpgradeActiveRun).not.toHaveBeenCalled()
    expect(forbidden).not.toHaveBeenCalled()
    setForbiddenHandler(null)
  })
})
