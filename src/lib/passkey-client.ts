/**
 * Platform entry for the passkey (WebAuthn) client.
 *
 * Metro prefers `passkey-client.web.ts` / `.native.ts` at bundle time. This
 * bare module exists so ESLint/`import/no-unresolved` and tools that ignore
 * platform suffixes can still resolve the import path.
 */
export {
  isPasskeySupported,
  loginWithPasskey,
  registerPasskey,
} from './passkey-client.native'
