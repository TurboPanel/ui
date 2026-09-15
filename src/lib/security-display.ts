import { formatLocalDateTime } from '@/lib/format-datetime'
import type { PasskeyRecord, TwoFactorStatus } from '@/lib/instance-api'

/**
 * Display helpers for the account security screen.
 *
 * The screen itself stays presentation-only; every string it renders that is
 * derived from the two-factor projection is decided here, where it is covered.
 */

/**
 * What a security card says when the two-factor projection could not be read.
 *
 * A failed load is not "two-factor off, no passkeys": offering enrollment or
 * passkey controls off an unknown state sends the operator into the wrong
 * workflow, so both cards fall back to this line instead.
 */
export const SECURITY_STATUS_UNAVAILABLE =
  'Unavailable until your security settings load. Reload the page to try again.'

/** The control plane allows an unset label — never render an empty row. */
export function passkeyDisplayName(passkey: Readonly<PasskeyRecord>): string {
  const name = passkey.name?.trim()
  return name && name.length > 0 ? name : 'Unnamed passkey'
}

/**
 * Whether the credential is synced to a provider (iCloud Keychain, a password
 * manager) or lives on one device — that is the fact an operator needs when
 * deciding whether losing the device locks them out.
 */
export function passkeyDeviceLabel(passkey: Readonly<PasskeyRecord>): string {
  if (passkey.deviceType === 'multiDevice') {
    return passkey.isBackedUp ? 'Synced' : 'Multi-device'
  }
  if (passkey.deviceType === 'singleDevice') {
    return 'This device only'
  }
  return passkey.isBackedUp ? 'Synced' : 'Unknown'
}

export function passkeyCreatedLabel(passkey: Readonly<PasskeyRecord>): string {
  return formatLocalDateTime(passkey.createdAt, {
    includeSeconds: false,
    timeZoneName: null,
    fallback: 'Unknown',
  })
}

export function twoFactorStatusLabel(
  status: Readonly<TwoFactorStatus> | undefined,
): string {
  if (!status?.enabled) return 'Not enabled'
  return status.method === 'totp' ? 'Authenticator app' : 'Enabled'
}

/**
 * Backup codes are single-use; running out silently is how an operator with a
 * lost phone gets locked out, so the count is warned on well before zero.
 */
export function backupCodesLabel(remaining: number): string {
  if (remaining <= 0) return 'No backup codes left'
  if (remaining === 1) return '1 backup code left'
  return `${remaining} backup codes left`
}

export function backupCodesRunningLow(remaining: number): boolean {
  return remaining <= 2
}

/**
 * A default label for a new credential, so the name field is never the thing
 * standing between the operator and a working passkey.
 */
export function defaultPasskeyName(now: Date = new Date()): string {
  return `Passkey ${formatLocalDateTime(now, {
    includeSeconds: false,
    timeZoneName: null,
    fallback: '',
  })}`.trim()
}

/** Trim and fall back, so a whitespace-only field still registers. */
export function resolvePasskeyName(input: string, now?: Date): string {
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : defaultPasskeyName(now)
}
