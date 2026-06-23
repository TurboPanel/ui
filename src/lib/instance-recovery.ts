import { fetchHealth, fetchInstallStatus, fetchSession } from '@/lib/instance-api'

export type RecoveryReason = 'reset' | 'restart' | 'unauthorized'

export function recoveryTitle(reason: RecoveryReason | null): string {
  switch (reason) {
    case 'reset':
      return 'Resetting dev instance'
    case 'unauthorized':
      return 'Reconnecting'
    default:
      return 'Restarting'
  }
}

export function recoveryDetail(reason: RecoveryReason | null): string {
  switch (reason) {
    case 'reset':
      return 'Postgres was wiped and the instance is restarting. This usually takes a few seconds.'
    case 'unauthorized':
      return 'Your session is no longer valid. Waiting for the instance to respond…'
    default:
      return 'Waiting for the instance to come back online…'
  }
}

export type RecoveryPollResult =
  | { kind: 'waiting' }
  | { kind: 'needsInstall' }
  | { kind: 'signedIn'; organizationId: string }
  | { kind: 'signIn' }

/** Poll public endpoints only — safe while the instance is restarting or sessions are invalid. */
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
  if (session?.organizationId) {
    return { kind: 'signedIn', organizationId: session.organizationId }
  }

  return { kind: 'signIn' }
}

export function parseRecoveryReason(value: string | string[] | undefined): RecoveryReason | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === 'reset' || raw === 'restart' || raw === 'unauthorized') {
    return raw
  }
  return null
}
