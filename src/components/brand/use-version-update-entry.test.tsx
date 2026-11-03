// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import { useVersionUpdateEntry } from './use-version-update-entry'

const { session, useInstanceUpdates, useUpgradeActiveRun, useDevelopmentUpdates } = vi.hoisted(
  () => ({
    session: { current: null as { role: string } | null },
    useInstanceUpdates: vi.fn(),
    useUpgradeActiveRun: vi.fn(),
    useDevelopmentUpdates: vi.fn(),
  })
)

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: session.current }),
  isAdminSession: (s: { role: string } | null) => s?.role === 'admin' || s?.role === 'superadmin',
  isSuperadminSession: (s: { role: string } | null) => s?.role === 'superadmin',
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceUpdates,
  useUpgradeActiveRun,
  useDevelopmentUpdates,
}))
vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))

const paused = { ok: true, channel: 'canary', updatesPaused: true } as unknown as InstanceUpdates

describe('useVersionUpdateEntry', () => {
  beforeEach(() => {
    useInstanceUpdates.mockReset().mockReturnValue({ data: paused })
    useUpgradeActiveRun.mockReset().mockReturnValue({ data: { run: null } })
    useDevelopmentUpdates.mockReset().mockReturnValue({ data: undefined })
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

  it('a development install reads the development view and lights only for daemon changes', () => {
    session.current = { role: 'superadmin' }
    const development = { ...paused, development: true }
    useInstanceUpdates.mockReturnValue({ data: development })
    useDevelopmentUpdates.mockReturnValue({ data: { pendingDaemonChanges: false } })
    const quiet = renderHook(() => useVersionUpdateEntry())
    expect(quiet.result.current.pending).toBe(false)
    expect(useDevelopmentUpdates).toHaveBeenCalledWith({ enabled: true })

    useDevelopmentUpdates.mockReturnValue({ data: { pendingDaemonChanges: true } })
    const lit = renderHook(() => useVersionUpdateEntry())
    expect(lit.result.current.pending).toBe(true)
  })

  it('a plain admin on a development install never reads the superadmin-only view', () => {
    session.current = { role: 'admin' }
    useInstanceUpdates.mockReturnValue({ data: { ...paused, development: true } })
    const { result } = renderHook(() => useVersionUpdateEntry())
    expect(useDevelopmentUpdates).toHaveBeenCalledWith({ enabled: false })
    expect(result.current.pending).toBe(false)
  })

  it('a release install never reads the development view', () => {
    session.current = { role: 'admin' }
    renderHook(() => useVersionUpdateEntry())
    expect(useDevelopmentUpdates).toHaveBeenCalledWith({ enabled: false })
  })
})
