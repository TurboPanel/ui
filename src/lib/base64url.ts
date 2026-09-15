/**
 * base64url ↔ bytes for WebAuthn ceremony payloads.
 *
 * The control plane encodes every binary ceremony field (challenge, credential
 * ids, user handle, attestation/assertion blobs) as base64url strings, while
 * `navigator.credentials` wants and returns binary. Hand-rolled rather than
 * `atob` / `btoa` so the same module works in the native bundle and under Node
 * during tests, where neither global is guaranteed.
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const DIGITS = new Map<string, number>()
for (let index = 0; index < ALPHABET.length; index += 1) {
  DIGITS.set(ALPHABET.charAt(index), index)
}
// Accept standard base64 too — some authenticators hand back `+` / `/`.
DIGITS.set('+', 62)
DIGITS.set('/', 63)

export function bytesToBase64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = index + 1 < bytes.length ? bytes[index + 1] : undefined
    const third = index + 2 < bytes.length ? bytes[index + 2] : undefined

    out += ALPHABET.charAt(first >> 2)
    out += ALPHABET.charAt(((first & 0b11) << 4) | ((second ?? 0) >> 4))
    if (second === undefined) break
    out += ALPHABET.charAt(((second & 0b1111) << 2) | ((third ?? 0) >> 6))
    if (third === undefined) break
    out += ALPHABET.charAt(third & 0b111111)
  }
  return out
}

export function base64urlToBytes(value: string): Uint8Array {
  const encoded = value.replaceAll('=', '')
  const bytes = new Uint8Array(Math.floor((encoded.length * 6) / 8))
  let buffer = 0
  let bits = 0
  let offset = 0

  for (const char of encoded) {
    const digit = DIGITS.get(char)
    if (digit === undefined) {
      throw new TypeError(`Invalid base64url input: ${char}`)
    }
    buffer = (buffer << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[offset] = (buffer >> bits) & 0xff
      offset += 1
    }
  }

  return bytes
}
