import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/instance-api', () => ({
  fetchHealth: vi.fn(),
  fetchInstallStatus: vi.fn(),
  fetchOrganizations: vi.fn(),
  fetchSession: vi.fn(),
}))

vi.mock('@/lib/org-context', () => ({
  resolvePreferredOrganizationId: vi.fn(),
  setActiveOrganizationId: vi.fn(),
}))

import {
  fetchHealth,
  fetchInstallStatus,
  fetchOrganizations,
  fetchSession,
  type InstallStatus,
  type SessionInfo,
} from '@/lib/instance-api'
import {
  parseRecoveryReason,
  pollInstanceRecovery,
  recoveryDetail,
  recoveryTitle,
} from '@/lib/instance-recovery'
import {
  resolvePreferredOrganizationId,
  setActiveOrganizationId,
} from '@/lib/org-context'

const installedStatus: InstallStatus = {
  needsInstall: false,
  isSignupEnabled: false,
}

const session: SessionInfo = {
  userId: 'u1',
  email: 'ops@example.com',
  role: 'member',
}

describe('instance-recovery copy helpers', () => {
  it('maps recovery titles by reason', () => {
    expect(recoveryTitle('reset')).toBe('Resetting dev instance')
    expect(recoveryTitle('unauthorized')).toBe('Reconnecting')
    expect(recoveryTitle('restart')).toBe('Restarting')
    expect(recoveryTitle(null)).toBe('Restarting')
  })

  it('maps recovery detail copy by reason', () => {
    expect(recoveryDetail('reset')).toContain('Postgres was wiped')
    expect(recoveryDetail('unauthorized')).toContain('session is no longer valid')
    expect(recoveryDetail('restart')).toContain('come back online')
    expect(recoveryDetail(null)).toContain('come back online')
  })

  it('parses recovery reason query values', () => {
    expect(parseRecoveryReason('reset')).toBe('reset')
    expect(parseRecoveryReason(['restart'])).toBe('restart')
    expect(parseRecoveryReason('invalid')).toBeNull()
    expect(parseRecoveryReason(undefined)).toBeNull()
  })
})

describe('pollInstanceRecovery', () => {
  beforeEach(() => {
    vi.mocked(fetchHealth).mockReset()
    vi.mocked(fetchInstallStatus).mockReset()
    vi.mocked(fetchOrganizations).mockReset()
    vi.mocked(fetchSession).mockReset()
    vi.mocked(resolvePreferredOrganizationId).mockReset()
    vi.mocked(setActiveOrganizationId).mockReset()
  })

  it('waits when health is not ok', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: false })
    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'waiting' })
  })

  it('waits when health throws', async () => {
    vi.mocked(fetchHealth).mockRejectedValue(new Error('down'))
    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'waiting' })
  })

  it('waits when install status throws', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockRejectedValue(new Error('502'))
    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'waiting' })
  })

  it('routes to install when needsInstall is true', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockResolvedValue({
      needsInstall: true,
      isSignupEnabled: false,
    })
    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'needsInstall' })
  })

  it('routes to sign-in when session is missing', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockResolvedValue(installedStatus)
    vi.mocked(fetchSession).mockResolvedValue(null)
    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'signIn' })
  })

  it('signs in when a preferred org exists', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockResolvedValue(installedStatus)
    vi.mocked(fetchSession).mockResolvedValue(session)
    vi.mocked(fetchOrganizations).mockResolvedValue({
      organizations: [
        {
          id: 'org-1',
          displayName: 'Ops',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    vi.mocked(resolvePreferredOrganizationId).mockReturnValue('org-1')

    await expect(pollInstanceRecovery()).resolves.toEqual({
      kind: 'signedIn',
      organizationId: 'org-1',
    })
    expect(setActiveOrganizationId).toHaveBeenCalledWith('org-1')
  })

  it('waits when organization fetch fails', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockResolvedValue(installedStatus)
    vi.mocked(fetchSession).mockResolvedValue(session)
    vi.mocked(fetchOrganizations).mockRejectedValue(new Error('503'))

    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'waiting' })
  })

  it('routes to welcome when signed in without a preferred org', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchInstallStatus).mockResolvedValue(installedStatus)
    vi.mocked(fetchSession).mockResolvedValue(session)
    vi.mocked(fetchOrganizations).mockResolvedValue({
      organizations: [
        {
          id: 'org-a',
          displayName: 'A',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'org-b',
          displayName: 'B',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    })
    vi.mocked(resolvePreferredOrganizationId).mockReturnValue(null)

    await expect(pollInstanceRecovery()).resolves.toEqual({ kind: 'welcome' })
  })
})
