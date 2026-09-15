import type { PasskeyClientResult } from '@/lib/passkey-client-types'

/**
 * Native passkey client.
 *
 * There is no WebAuthn binding in this app's native runtime, so every entry
 * point answers "unsupported" and the caller falls back to
 * `PASSKEY_WEB_ONLY_NOTE`. TOTP enrollment is unaffected — it is a text
 * ceremony and works on every platform.
 */
export function isPasskeySupported(): boolean {
  return false
}

export async function registerPasskey(
  _options: unknown,
): Promise<PasskeyClientResult> {
  return { supported: false }
}

export async function loginWithPasskey(
  _options: unknown,
): Promise<PasskeyClientResult> {
  return { supported: false }
}
