// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import { useVersionUpdateEntry } from './use-version-update-entry'

const { session, useInstanceUpdates, useUpgradeActiveRun } = vi.hoisted(() => ({
  session: { current: null as { role: string } | null },
  useInstanceUpdates: vi.fn(),
  useUpgradeActiveRun: vi.fn(),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: session.current }),
  isAdminSession: (s: { role: string } | null) => s?.role === 'admin' || s?.role === 'superadmin',
}))
vi.mock('@/lib/queries/admin', () => ({ useInstanceUpdates, useUpgradeActiveRun }))
vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))

const paused = { ok: true, channel: 'canary', updatesPaused: true } as unknown as InstanceUpdates

describe('useVersionUpdateEntry', () => {
  beforeEach(() => {
    useInstanceUpdates.mockReset().mockReturnValue({ data: paused })
    useUpgradeActiveRun.mockReset().mockReturnValue({ data: { run: null } })
  })

  it('an instance admin reads the update status and sees what is pending', () => {
    session.current = { role: 'admin' }
    const { result } = renderHook(() => useVersionUpdateEntry())
    expect(result.current).toEqual({ isInstanceAdmin: true, pending: true })
    expect(useInstanceUpdates).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })

  it('anyone else reads nothing and never has anything pending', () => {
    session.current = { role: 'user' }
    const { result } = renderHook(() => useVersionUpdateEntry())
    expect(result.current).toEqual({ isInstanceAdmin: false, pending: false })
    expect(useInstanceUpdates).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(useUpgradeActiveRun).toHaveBeenCalledWith({ enabled: false })
  })
})
