import { base64urlToBytes, bytesToBase64url } from '@/lib/base64url'
import { usesSameOriginApi } from '@/lib/control-plane'
import type { PasskeyClientResult } from '@/lib/passkey-client-types'

/**
 * Browser passkey client.
 *
 * The control plane hands out ceremony options with every binary field
 * base64url-encoded, and expects the resulting credential back in the same
 * encoding. This module is the only place that translates between that JSON
 * and the `ArrayBuffer`s `navigator.credentials` deals in.
 *
 * WebAuthn is bound to the page origin, so it is only offered when the console
 * talks to a same-origin control plane — a native shell or a Metro dev origin
 * would be signing against the wrong relying party.
 */

type CredentialsContainerLike = {
  create: (options: Record<string, unknown>) => Promise<unknown>
  get: (options: Record<string, unknown>) => Promise<unknown>
}

export function isPasskeySupported(): boolean {
  if (!usesSameOriginApi()) return false
  if (typeof window === 'undefined') return false
  return 'PublicKeyCredential' in window
}

function credentialsContainer(): CredentialsContainerLike | null {
  if (!isPasskeySupported()) return null
  const nav = globalThis.navigator as unknown as
    | { credentials?: CredentialsContainerLike }
    | undefined
  return nav?.credentials ?? null
}

export async function registerPasskey(
  options: unknown,
): Promise<PasskeyClientResult> {
  const credentials = credentialsContainer()
  if (!credentials) return { supported: false }

  const credential = await credentials.create({
    publicKey: toCreationOptions(options),
  })
  if (!credential) {
    throw new Error('Passkey registration was cancelled.')
  }
  return { supported: true, credential: serializeAttestation(credential) }
}

export async function loginWithPasskey(
  options: unknown,
): Promise<PasskeyClientResult> {
  const credentials = credentialsContainer()
  if (!credentials) return { supported: false }

  const credential = await credentials.get({
    publicKey: toRequestOptions(options),
  })
  if (!credential) {
    throw new Error('Passkey sign-in was cancelled.')
  }
  return { supported: true, credential: serializeAssertion(credential) }
}

/**
 * Server registration options → the shape `navigator.credentials.create` wants.
 *
 * The credential list is destructured out rather than spread over, so a server
 * that sends `excludeCredentials: null` yields an absent key instead of a null
 * one — WebAuthn rejects the latter.
 */
export function toCreationOptions(payload: unknown): Record<string, unknown> {
  const { challenge, user, excludeCredentials, ...rest } = asRecord(payload)
  const account = asRecord(user)
  return {
    ...rest,
    challenge: base64urlToBytes(readString(challenge)),
    user: { ...account, id: base64urlToBytes(readString(account.id)) },
    ...(Array.isArray(excludeCredentials)
      ? { excludeCredentials: excludeCredentials.map(toDescriptor) }
      : {}),
  }
}

/** Server login options → the shape `navigator.credentials.get` wants. */
export function toRequestOptions(payload: unknown): Record<string, unknown> {
  const { challenge, allowCredentials, ...rest } = asRecord(payload)
  return {
    ...rest,
    challenge: base64urlToBytes(readString(challenge)),
    ...(Array.isArray(allowCredentials)
      ? { allowCredentials: allowCredentials.map(toDescriptor) }
      : {}),
  }
}

/** Registration credential → the JSON `POST /passkeys/register/verify` parses. */
export function serializeAttestation(
  credential: unknown,
): Record<string, unknown> {
  const record = asRecord(credential)
  const response = asRecord(record.response)
  const transports = readTransports(response)
  return {
    id: readString(record.id),
    rawId: bytesToBase64url(asBinary(record.rawId)),
    type: readCredentialType(record.type),
    response: {
      clientDataJSON: bytesToBase64url(asBinary(response.clientDataJSON)),
      attestationObject: bytesToBase64url(asBinary(response.attestationObject)),
      ...(transports ? { transports } : {}),
    },
    ...(transports ? { transports } : {}),
  }
}

/** Login credential → the JSON `POST /passkeys/login/verify` parses. */
export function serializeAssertion(
  credential: unknown,
): Record<string, unknown> {
  const record = asRecord(credential)
  const response = asRecord(record.response)
  const userHandle = response.userHandle
  return {
    id: readString(record.id),
    rawId: bytesToBase64url(asBinary(record.rawId)),
    type: readCredentialType(record.type),
    response: {
      clientDataJSON: bytesToBase64url(asBinary(response.clientDataJSON)),
      authenticatorData: bytesToBase64url(asBinary(response.authenticatorData)),
      signature: bytesToBase64url(asBinary(response.signature)),
      userHandle:
        userHandle === null || userHandle === undefined
          ? null
          : bytesToBase64url(asBinary(userHandle)),
    },
  }
}

function toDescriptor(entry: unknown): Record<string, unknown> {
  const record = asRecord(entry)
  return { ...record, id: base64urlToBytes(readString(record.id)) }
}

function readTransports(response: Record<string, unknown>): string[] | null {
  const getTransports = response.getTransports
  if (typeof getTransports !== 'function') return null
  const transports: unknown = (getTransports as () => unknown).call(response)
  if (!Array.isArray(transports)) return null
  const named = transports.filter(
    (entry): entry is string => typeof entry === 'string',
  )
  return named.length > 0 ? named : null
}

function readCredentialType(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'public-key'
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Malformed passkey ceremony payload')
  }
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Malformed passkey ceremony payload')
  }
  return value
}

function asBinary(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new TypeError('Malformed passkey credential response')
}
