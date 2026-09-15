/**
 * Shared types for the platform-split passkey client
 * (`passkey-client.web.ts` / `passkey-client.native.ts`).
 */

/**
 * Outcome of a WebAuthn ceremony.
 *
 * `supported: false` is the native / non-same-origin answer, not a failure —
 * callers render {@link PASSKEY_WEB_ONLY_NOTE} instead of an error.
 */
export type PasskeyClientResult =
  | { supported: true; credential: unknown }
  | { supported: false }

export const PASSKEY_WEB_ONLY_NOTE =
  'Passkeys are available in the browser only. Open this in a web browser to set one up.'
