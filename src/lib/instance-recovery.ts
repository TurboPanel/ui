import { fetchHealth, fetchInstallStatus, fetchOrganizations, fetchSession } from '@/lib/instance-api'
import { resolvePreferredOrganizationId, setActiveOrganizationId } from '@/lib/org-context'

export type RecoveryReason = 'reset' | 'restart' | 'unauthorized'

export function recoveryTitle(reason: RecoveryReason | null): string {
  switch (reason) {
    case 'reset':
      return 'Resetting the dev control plane'
    case 'unauthorized':
      return 'Reconnecting'
    default:
      return 'Restarting'
  }
}

export function recoveryDetail(reason: RecoveryReason | null): string {
  switch (reason) {
    case 'reset':
      return 'Postgres was wiped and the control plane is restarting. This usually takes a few seconds.'
    case 'unauthorized':
      return 'Your session is no longer valid. Waiting for the control plane to respond…'
    default:
      return 'Waiting for the control plane to come back online…'
  }
}

export type RecoveryPollResult =
  | { kind: 'waiting' }
  | { kind: 'needsInstall' }
  | { kind: 'signedIn'; organizationId: string }
  | { kind: 'welcome' }
  | { kind: 'signIn' }

/** Poll public endpoints only — safe while the control plane is restarting or sessions are invalid. */
export async function pollInstanceRecovery(): Promise<RecoveryPollResult> {
  try {
    const health = await fetchHealth()
    if (!health.ok) return { kind: 'waiting' }
  } catch {
    return { kind: 'waiting' }
  }

  let needsInstall = false
  try {
    const status = await fetchInstallStatus()
    needsInstall = status.needsInstall ?? false
  } catch {
    return { kind: 'waiting' }
  }

  if (needsInstall) {
    return { kind: 'needsInstall' }
  }

  const session = await fetchSession()
  if (!session) {
    return { kind: 'signIn' }
  }

  try {
    const { organizations } = await fetchOrganizations()
    const preferred = resolvePreferredOrganizationId(organizations)
    if (preferred) {
      setActiveOrganizationId(preferred)
      return { kind: 'signedIn', organizationId: preferred }
    }
  } catch {
    return { kind: 'waiting' }
  }

  return { kind: 'welcome' }
}

export function parseRecoveryReason(value: string | string[] | undefined): RecoveryReason | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === 'reset' || raw === 'restart' || raw === 'unauthorized') {
    return raw
  }
  return null
}
